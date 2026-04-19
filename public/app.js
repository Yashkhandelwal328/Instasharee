/* ─────────────────────────────────────────────────────────────────────────────
   instashare.io — app.js
   File transfer via Neon PostgreSQL backend.
   
   API Routes:
     POST /api/upload      — multipart/form-data → returns { key }
     GET  /api/check/:key  — returns { exists: true/false }
     GET  /api/download/:key — returns { files: [{name, size, type, data}] }
───────────────────────────────────────────────────────────────────────────── */

'use strict';

/* ── Constants ────────────────────────────────────────────────────────────── */
const EXPIRE_SECS = 600;

/* ── Utility helpers ──────────────────────────────────────────────────────── */
function fmtSize(b) {
  if (b < 1024)        return b + ' B';
  if (b < 1_048_576)   return (b / 1024).toFixed(1) + ' KB';
  if (b < 1_073_741_824) return (b / 1_048_576).toFixed(1) + ' MB';
  return (b / 1_073_741_824).toFixed(2) + ' GB';
}

function getExt(name = '') {
  const i = name.lastIndexOf('.');
  return i > -1 ? name.slice(i + 1) : '';
}

function fmtTime(secs) {
  const m = String(Math.floor(secs / 60)).padStart(2, '0');
  const s = String(secs % 60).padStart(2, '0');
  return `${m}:${s}`;
}

/* ── File icon helper ─────────────────────────────────────────────────────── */
const EXT_COLORS = {
  pdf: '#ef4444', jpg: '#f59e0b', jpeg: '#f59e0b', png: '#10b981',
  gif: '#8b5cf6', mp4: '#3b82f6', mp3: '#ec4899', zip: '#6366f1',
  rar: '#6366f1', docx: '#2563eb', doc: '#2563eb', xlsx: '#059669',
  txt: '#64748b',
};

function fileIconHTML(ext) {
  const color = EXT_COLORS[ext?.toLowerCase()] || '#94a3b8';
  const label = (ext || '?').toUpperCase().slice(0, 4);
  return `
    <div class="file-icon" style="background:${color}20; color:${color}; border:1px solid ${color}30;">
      ${label}
    </div>`;
}

function fileRowHTML(name, size, removable = false, id = '') {
  const ext = getExt(name);
  return `
    <li class="file-row" data-id="${id}">
      ${fileIconHTML(ext)}
      <div class="file-info">
        <span class="file-name">${escapeHtml(name)}</span>
        <span class="file-size">${fmtSize(size)}</span>
      </div>
      ${removable ? `
        <button class="remove-btn" aria-label="Remove file" onclick="sendMgr.removeFile('${id}')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>` : ''}
    </li>`;
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ── QR Code SVG (pseudo-random, key-derived) ─────────────────────────────── */
function qrSVG(value) {
  const seed = parseInt(value) || 0;
  let mods = '';
  for (let i = 0; i < 48; i++) {
    const x = 38 + (i % 6) * 8, y = 5 + Math.floor(i / 6) * 8;
    if (((seed * 17 + i * 31) % 7) > 2) mods += `<rect x="${x}" y="${y}" width="6" height="6" fill="#0f172a"/>`;
  }
  for (let i = 0; i < 20; i++) {
    const x = 5 + (i % 4) * 8, y = 40 + Math.floor(i / 4) * 8;
    if (i % 3 === 0 || i % 5 === 1) mods += `<rect x="${x}" y="${y}" width="6" height="6" fill="#0f172a"/>`;
  }
  return `<svg viewBox="0 0 90 90" xmlns="http://www.w3.org/2000/svg">
    <rect x="5"  y="5"  width="28" height="28" rx="3" fill="#0f172a"/>
    <rect x="10" y="10" width="18" height="18" rx="2" fill="#fff"/>
    <rect x="14" y="14" width="10" height="10" rx="1" fill="#0f172a"/>
    <rect x="57" y="5"  width="28" height="28" rx="3" fill="#0f172a"/>
    <rect x="62" y="10" width="18" height="18" rx="2" fill="#fff"/>
    <rect x="66" y="14" width="10" height="10" rx="1" fill="#0f172a"/>
    <rect x="5"  y="57" width="28" height="28" rx="3" fill="#0f172a"/>
    <rect x="10" y="62" width="18" height="18" rx="2" fill="#fff"/>
    <rect x="14" y="66" width="10" height="10" rx="1" fill="#0f172a"/>
    ${mods}
  </svg>
  <span class="qr-key-label">${value}</span>`;
}

/* ── DOM helpers ──────────────────────────────────────────────────────────── */
const $ = (id) => document.getElementById(id);
function show(el) { el?.classList.remove('hidden'); }
function hide(el) { el?.classList.add('hidden'); }
function animateIn(el, cls = 'animate-scale-in') {
  el?.classList.remove(cls);
  void el?.offsetWidth; // reflow
  el?.classList.add(cls);
}

/* ══════════════════════════════════════════════════════════════════════════════
   TABS
══════════════════════════════════════════════════════════════════════════════ */
function initTabs() {
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => {
        t.classList.remove('tab-active');
        t.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('tab-active');
      btn.setAttribute('aria-selected', 'true');

      const target = btn.dataset.tab;
      document.querySelectorAll('.panel').forEach((p) => hide(p));
      show($(`panel-${target}`));
    });
  });
}

/* ══════════════════════════════════════════════════════════════════════════════
   SEND MANAGER
══════════════════════════════════════════════════════════════════════════════ */
const sendMgr = (() => {
  let files    = [];    // { file, id }
  let sendKey  = '';
  let timerRef = null;
  let expires  = EXPIRE_SECS;

  /* ── File picking ─────────────────────────────────────────────────────── */
  function initSend() {
    const dropZone  = $('drop-zone');
    const fileInput = $('file-input');
    const btnSend   = $('btn-send');

    if (!dropZone || !fileInput || !btnSend) return;

    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') fileInput.click(); });
    fileInput.addEventListener('change', (e) => addFiles(Array.from(e.target.files)));

    dropZone.addEventListener('dragover',  (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', ()  => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      addFiles(Array.from(e.dataTransfer.files));
    });

    btnSend.addEventListener('click', startSend);
    $('btn-cancel-send')?.addEventListener('click', cancelSend);

    $('btn-send-reset')?.addEventListener('click', () => {
      clearInterval(timerRef);
      files = []; sendKey = '';
      const fileList = $('file-list');
      if (fileList) fileList.innerHTML = '';
      hide(fileList);
      btnSend.disabled = true;
      btnSend.classList.add('btn-disabled');
      if ($('send-bar')) $('send-bar').style.width = '0%';
      if ($('send-pct')) $('send-pct').textContent = '0%';
      showState('idle');
    });
  }

  function addFiles(incoming) {
    incoming.forEach((f) => files.push({ file: f, id: Math.random().toString(36).slice(2) }));
    renderFileList();
  }

  function removeFile(id) {
    files = files.filter((f) => f.id !== id);
    renderFileList();
  }

  function renderFileList() {
    const fileList = $('file-list');
    const btnSend  = $('btn-send');
    if (!fileList || !btnSend) return;

    if (files.length === 0) {
      hide(fileList);
      btnSend.disabled = true;
      btnSend.classList.add('btn-disabled');
      return;
    }
    show(fileList);
    fileList.innerHTML = files.map(({ file, id }) => fileRowHTML(file.name, file.size, true, id)).join('');
    btnSend.disabled = false;
    btnSend.classList.remove('btn-disabled');
  }

  /* ── Send flow (upload to server) ────────────────────────────────────── */
  async function startSend() {
    if (!files.length) return;

    // Show uploading spinner
    showState('uploading');

    try {
      // Build FormData with all files
      const formData = new FormData();
      files.forEach(({ file }) => formData.append('files', file));

      // Upload to server
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        throw new Error('Upload failed');
      }

      const data = await res.json();
      sendKey = data.key;
      expires = EXPIRE_SECS;

      // Render waiting state
      showState('waiting');
      renderKeyDigits(sendKey);
      $('send-qr').innerHTML = qrSVG(sendKey);
      $('expires-count').textContent = fmtTime(expires);

      // Countdown
      timerRef = setInterval(() => {
        expires--;
        $('expires-count').textContent = fmtTime(expires);
        if (expires <= 0) { clearInterval(timerRef); cancelSend(); }
      }, 1000);

    } catch (err) {
      console.error('Upload error:', err);
      showState('idle');
      alert('Upload failed. Please try again.');
    }
  }

  function renderKeyDigits(key) {
    $('send-key-digits').innerHTML = key.split('').map(
      (d) => `<div class="key-digit">${d}</div>`
    ).join('');
  }

  function cancelSend() {
    clearInterval(timerRef);
    sendKey = '';
    showState('idle');
  }

  /* ── State machine ────────────────────────────────────────────────────── */
  const STATES = {
    idle: 'send-idle',
    uploading: 'send-uploading',
    waiting: 'send-waiting',
    transferring: 'send-transferring',
    done: 'send-done'
  };
  function showState(name) {
    Object.values(STATES).forEach((id) => hide($(id)));
    show($(STATES[name]));
  }

  return { initSend, removeFile };
})();

/* ══════════════════════════════════════════════════════════════════════════════
   RECEIVE MANAGER
══════════════════════════════════════════════════════════════════════════════ */
const recvMgr = (() => {
  let recvData = null;
  let currentKey = '';

  function initRecv() {
    const keyInput   = $('key-input');
    const btnReceive = $('btn-receive');

    if (!keyInput || !btnReceive) return;

    const digitBoxes = document.querySelectorAll('.digit-box');

    keyInput.addEventListener('input', () => {
      const val = keyInput.value.replace(/\D/g, '').slice(0, 6);
      keyInput.value = val;

      // Update digit boxes
      digitBoxes.forEach((box, i) => {
        box.textContent = val[i] || '';
        box.classList.toggle('filled', !!val[i]);
      });

      // Enable/disable button
      if (val.length === 6) {
        btnReceive.disabled = false;
        btnReceive.classList.remove('btn-disabled');
      } else {
        btnReceive.disabled = true;
        btnReceive.classList.add('btn-disabled');
      }
    });

    keyInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && keyInput.value.length === 6) startReceive();
    });

    btnReceive.addEventListener('click', startReceive);
    $('btn-download')?.addEventListener('click', startDownload);
    $('btn-recv-reset')?.addEventListener('click', resetRecv);
    $('btn-recv-error-reset')?.addEventListener('click', resetRecv);
  }

  /* ── Receive flow (poll server for key) ──────────────────────────────── */
  function startReceive() {
    const keyInput = $('key-input');
    const key = keyInput?.value;
    if (!key || key.length < 6) return;
    currentKey = key;
    showState('searching');
    $('recv-searching-key').textContent = `Key: ${key}`;
    pollForKey(key);
  }

  function pollForKey(key) {
    let attempts = 0;
    const iv = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch(`/api/check/${key}`);
        const data = await res.json();

        if (data.exists) {
          clearInterval(iv);
          // Fetch the actual files
          const dlRes = await fetch(`/api/download/${key}`);
          if (dlRes.ok) {
            const dlData = await dlRes.json();
            recvData = dlData;
            showState('found');
            animateIn($('recv-found'));
            renderFoundFiles(dlData.files);
          } else {
            clearInterval(iv);
            showState('error');
            animateIn($('recv-error'));
          }
        } else if (attempts > 30) {
          clearInterval(iv);
          showState('error');
          animateIn($('recv-error'));
        }
      } catch {
        /* keep polling */
      }
    }, 1000);
  }

  function renderFoundFiles(fileList) {
    const list  = $('recv-file-list');
    const label = $('btn-download-label');
    list.innerHTML = fileList.map((f) => fileRowHTML(f.name, f.size)).join('');
    label.textContent = `Download ${fileList.length} file${fileList.length > 1 ? 's' : ''}`;
  }

  function startDownload() {
    if (!recvData || !recvData.files) return;
    showState('downloading');
    let p = 0;
    const bar = $('recv-bar');
    const pct = $('recv-pct');
    const iv  = setInterval(() => {
      p += Math.random() * 18 + 8;
      if (p >= 100) {
        p = 100; clearInterval(iv);
        bar.style.width = '100%'; pct.textContent = '100%';
        setTimeout(() => {
          triggerDownloads(recvData.files);
          showState('done');
          animateIn($('recv-done'));
        }, 200);
        return;
      }
      bar.style.width = p + '%';
      pct.textContent = Math.round(p) + '%';
    }, 140);
  }

  /**
   * Convert base64 string back to binary and trigger browser download.
   */
  function triggerDownloads(files) {
    files.forEach((f) => {
      // Decode base64 to binary
      const binaryStr = atob(f.data);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: f.type });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = f.name; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    });
  }

  function resetRecv() {
    recvData = null; currentKey = '';
    const keyInput   = $('key-input');
    const btnReceive = $('btn-receive');
    const digitBoxes = document.querySelectorAll('.digit-box');

    if (keyInput) keyInput.value = '';
    digitBoxes.forEach((b) => { b.textContent = ''; b.classList.remove('filled'); });
    if (btnReceive) {
      btnReceive.disabled = true;
      btnReceive.classList.add('btn-disabled');
    }
    if ($('recv-bar')) $('recv-bar').style.width = '0%';
    if ($('recv-pct')) $('recv-pct').textContent = '0%';
    showState('idle');
  }

  /* ── State machine ────────────────────────────────────────────────────── */
  const STATES = {
    idle: 'recv-idle', searching: 'recv-searching', found: 'recv-found',
    downloading: 'recv-downloading', done: 'recv-done', error: 'recv-error',
  };
  function showState(name) {
    Object.values(STATES).forEach((id) => hide($(id)));
    show($(STATES[name]));
  }

  return { initRecv };
})();

/* ══════════════════════════════════════════════════════════════════════════════
   BOOTSTRAP — wait for DOM then init
══════════════════════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  sendMgr.initSend();
  recvMgr.initRecv();
});
