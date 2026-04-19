/* ─────────────────────────────────────────────────────────────────────────────
   instashare.io — app.js
   True Peer-to-Peer file transfer via WebRTC DataChannels.
   
   The server is ONLY used for signaling (exchanging WebRTC offers/answers).
   File data flows directly browser-to-browser — never touches any server.
   
   Signaling API:
     POST /api/signal          — create room (sender) or submit answer (receiver)
     GET  /api/signal?key=xxx  — get room offer (receiver)
     GET  /api/signal/stream?key=xxx — SSE stream for signaling events (sender)
───────────────────────────────────────────────────────────────────────────── */

'use strict';

/* ── Constants ────────────────────────────────────────────────────────────── */
const CHUNK_SIZE   = 64 * 1024;    // 64 KB per DataChannel message
const BUFFER_THRESHOLD = 1024 * 1024; // 1 MB — pause sending when buffered > this

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
];

/* ── Utility helpers ──────────────────────────────────────────────────────── */
function fmtSize(b) {
  if (b < 1024)        return b + ' B';
  if (b < 1_048_576)   return (b / 1024).toFixed(1) + ' KB';
  if (b < 1_073_741_824) return (b / 1_048_576).toFixed(1) + ' MB';
  return (b / 1_073_741_824).toFixed(2) + ' GB';
}

function fmtSpeed(bytesPerSec) {
  if (bytesPerSec < 1024)        return Math.round(bytesPerSec) + ' B/s';
  if (bytesPerSec < 1_048_576)   return (bytesPerSec / 1024).toFixed(1) + ' KB/s';
  if (bytesPerSec < 1_073_741_824) return (bytesPerSec / 1_048_576).toFixed(1) + ' MB/s';
  return (bytesPerSec / 1_073_741_824).toFixed(2) + ' GB/s';
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
  txt: '#64748b', svg: '#8b5cf6', webp: '#f59e0b', mkv: '#3b82f6',
  avi: '#3b82f6', mov: '#3b82f6', wav: '#ec4899', flac: '#ec4899',
  '7z': '#6366f1', tar: '#6366f1', gz: '#6366f1',
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
  void el?.offsetWidth;
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
   SEND MANAGER — WebRTC P2P Sender
══════════════════════════════════════════════════════════════════════════════ */
const sendMgr = (() => {
  let files     = [];    // { file, id }
  let sendKey   = '';
  let timerRef  = null;
  let expires   = 600;
  let pc        = null;  // RTCPeerConnection
  let dc        = null;  // DataChannel
  let sseSource = null;  // EventSource for signaling
  let aborted   = false;

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
      cleanup();
      files = []; sendKey = '';
      const fileList = $('file-list');
      if (fileList) fileList.innerHTML = '';
      hide(fileList);
      btnSend.disabled = true;
      btnSend.classList.add('btn-disabled');
      if ($('send-bar')) $('send-bar').style.width = '0%';
      if ($('send-pct')) $('send-pct').textContent = '0%';
      if ($('send-speed')) $('send-speed').textContent = '';
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

  /* ── P2P Send Flow ────────────────────────────────────────────────────── */
  async function startSend() {
    if (!files.length) return;
    aborted = false;

    showState('connecting');

    try {
      // 1. Create RTCPeerConnection
      pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

      // 2. Create DataChannel
      dc = pc.createDataChannel('fileTransfer', {
        ordered: true,
      });

      dc.binaryType = 'arraybuffer';

      // When DataChannel opens → start streaming files
      dc.onopen = () => {
        if (aborted) return;
        showState('transferring');
        streamFiles();
      };

      dc.onerror = (e) => {
        console.error('DataChannel error:', e);
      };

      // 3. Gather ICE candidates
      const iceCandidates = [];
      const iceGatheringDone = new Promise((resolve) => {
        pc.onicecandidate = (e) => {
          if (e.candidate) {
            iceCandidates.push(e.candidate.toJSON());
          } else {
            resolve(); // All candidates gathered
          }
        };
        // Timeout fallback
        setTimeout(resolve, 5000);
      });

      // 4. Create offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Wait for ICE gathering
      await iceGatheringDone;

      // 5. Build file metadata
      const filesMeta = files.map(({ file }) => ({
        name: file.name,
        size: file.size,
        type: file.type || 'application/octet-stream',
      }));

      // 6. Send offer + metadata to signaling server
      const res = await fetch('/api/signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          offer: pc.localDescription.toJSON(),
          filesMeta,
        }),
      });

      if (!res.ok) throw new Error('Failed to create signaling room');

      const { key } = await res.json();
      sendKey = key;
      expires = 600;

      // Show waiting state with key
      showState('waiting');
      renderKeyDigits(sendKey);
      $('send-qr').innerHTML = qrSVG(sendKey);
      $('expires-count').textContent = fmtTime(expires);

      // Countdown timer
      timerRef = setInterval(() => {
        expires--;
        $('expires-count').textContent = fmtTime(expires);
        if (expires <= 0) { cancelSend(); }
      }, 1000);

      // 7. Subscribe to SSE for receiver's answer
      sseSource = new EventSource(`/api/signal/stream?key=${sendKey}`);

      sseSource.onmessage = async (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === 'answer' && msg.answer) {
            // Set remote description (receiver's answer)
            await pc.setRemoteDescription(new RTCSessionDescription(msg.answer));

            // Add ICE candidates from receiver
            if (msg.candidates) {
              for (const c of msg.candidates) {
                try {
                  await pc.addIceCandidate(new RTCIceCandidate(c));
                } catch { /* ignore duplicate candidates */ }
              }
            }

            // Close SSE — signaling is done
            sseSource.close();
            sseSource = null;
            clearInterval(timerRef);
          }

          if (msg.type === 'ice' && msg.candidate) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
            } catch { /* ignore */ }
          }

          if (msg.type === 'expired') {
            cancelSend();
          }
        } catch (err) {
          console.error('SSE message error:', err);
        }
      };

      sseSource.onerror = () => {
        // SSE will auto-reconnect, but if room expired it'll 404
      };

    } catch (err) {
      console.error('Send setup error:', err);
      cleanup();
      showState('idle');
      alert('Connection setup failed. Please try again.');
    }
  }

  /* ── Stream files over DataChannel ────────────────────────────────────── */
  async function streamFiles() {
    const totalSize = files.reduce((sum, { file }) => sum + file.size, 0);
    let totalSent = 0;
    const startTime = Date.now();

    // Send file count first
    dc.send(JSON.stringify({ type: 'meta', fileCount: files.length, totalSize }));

    for (const { file } of files) {
      if (aborted) return;

      // Send file header
      dc.send(JSON.stringify({
        type: 'fileStart',
        name: file.name,
        size: file.size,
        mimeType: file.type || 'application/octet-stream',
      }));

      // Read and send file in chunks
      let offset = 0;
      while (offset < file.size) {
        if (aborted) return;

        const slice = file.slice(offset, offset + CHUNK_SIZE);
        const buffer = await slice.arrayBuffer();

        // Flow control — wait if buffer is getting full
        while (dc.bufferedAmount > BUFFER_THRESHOLD) {
          await new Promise((r) => setTimeout(r, 50));
          if (aborted) return;
        }

        dc.send(buffer);
        offset += buffer.byteLength;
        totalSent += buffer.byteLength;

        // Update progress
        const pct = Math.round((totalSent / totalSize) * 100);
        const elapsed = (Date.now() - startTime) / 1000;
        const speed = elapsed > 0 ? totalSent / elapsed : 0;

        if ($('send-bar')) $('send-bar').style.width = pct + '%';
        if ($('send-pct')) $('send-pct').textContent = pct + '%';
        if ($('send-speed')) $('send-speed').textContent = fmtSpeed(speed);
      }

      // Signal end of this file
      dc.send(JSON.stringify({ type: 'fileEnd', name: file.name }));
    }

    // Signal all files done
    dc.send(JSON.stringify({ type: 'allDone' }));

    // Show completion
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const avgSpeed = fmtSpeed(totalSent / (elapsed || 1));
    if ($('send-done-sub')) {
      $('send-done-sub').textContent = `${files.length} file${files.length > 1 ? 's' : ''} · ${fmtSize(totalSent)} · ${elapsed}s · ${avgSpeed}`;
    }
    showState('done');
  }

  function renderKeyDigits(key) {
    $('send-key-digits').innerHTML = key.split('').map(
      (d) => `<div class="key-digit">${d}</div>`
    ).join('');
  }

  function cancelSend() {
    aborted = true;
    cleanup();
    showState('idle');
  }

  function cleanup() {
    clearInterval(timerRef);
    if (sseSource) { sseSource.close(); sseSource = null; }
    if (dc) { try { dc.close(); } catch {} dc = null; }
    if (pc) { try { pc.close(); } catch {} pc = null; }
    sendKey = '';
  }

  /* ── State machine ────────────────────────────────────────────────────── */
  const STATES = {
    idle: 'send-idle',
    connecting: 'send-connecting',
    waiting: 'send-waiting',
    transferring: 'send-transferring',
    done: 'send-done'
  };
  function showState(name) {
    Object.values(STATES).forEach((id) => hide($(id)));
    show($(STATES[name]));
  }

  return { initSend, removeFile, addFiles, startSend, getFiles: () => files };
})();

/* ══════════════════════════════════════════════════════════════════════════════
   RECEIVE MANAGER — WebRTC P2P Receiver
══════════════════════════════════════════════════════════════════════════════ */
const recvMgr = (() => {
  let pc           = null;
  let currentKey   = '';
  let receivedFiles = [];
  let currentFile  = null;
  let currentChunks = [];
  let currentSize  = 0;
  let totalSize    = 0;
  let totalReceived = 0;
  let fileCount    = 0;
  let startTime    = 0;

  function initRecv() {
    const keyInput   = $('key-input');
    const btnReceive = $('btn-receive');

    if (!keyInput || !btnReceive) return;

    const digitBoxes = document.querySelectorAll('.digit-box');

    keyInput.addEventListener('input', () => {
      const val = keyInput.value.replace(/\D/g, '').slice(0, 6);
      keyInput.value = val;

      digitBoxes.forEach((box, i) => {
        box.textContent = val[i] || '';
        box.classList.toggle('filled', !!val[i]);
      });

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
    $('btn-recv-reset')?.addEventListener('click', resetRecv);
    $('btn-recv-error-reset')?.addEventListener('click', resetRecv);
  }

  /* ── Receive flow ────────────────────────────────────────────────────── */
  async function startReceive() {
    const keyInput = $('key-input');
    const key = keyInput?.value;
    if (!key || key.length < 6) return;
    currentKey = key;

    showState('searching');
    $('recv-searching-key').textContent = `Key: ${key}`;

    try {
      // 1. Fetch sender's offer from signaling server
      const res = await fetch(`/api/signal?key=${key}`);
      const data = await res.json();

      if (!data.exists || !data.offer) {
        showState('error');
        animateIn($('recv-error'));
        return;
      }

      // 2. Show files that will be received
      showState('found');
      animateIn($('recv-found'));
      renderFoundFiles(data.filesMeta);

      // Store offer for when user clicks download
      $('btn-download').onclick = () => connectAndReceive(key, data.offer);

    } catch (err) {
      console.error('Receive error:', err);
      showState('error');
      animateIn($('recv-error'));
    }
  }

  function renderFoundFiles(fileList) {
    const list  = $('recv-file-list');
    const label = $('btn-download-label');
    list.innerHTML = fileList.map((f) => fileRowHTML(f.name, f.size)).join('');
    const total = fileList.reduce((s, f) => s + f.size, 0);
    label.textContent = `Download ${fileList.length} file${fileList.length > 1 ? 's' : ''} (${fmtSize(total)})`;
  }

  /* ── Connect via WebRTC and receive files ─────────────────────────────── */
  async function connectAndReceive(key, offer) {
    showState('downloading');
    if ($('recv-status')) $('recv-status').textContent = 'Establishing P2P connection…';

    try {
      // 1. Create RTCPeerConnection
      pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

      // 2. Handle incoming DataChannel
      pc.ondatachannel = (event) => {
        const dc = event.channel;
        dc.binaryType = 'arraybuffer';

        dc.onmessage = (e) => handleDataChannelMessage(e.data);

        dc.onerror = (err) => {
          console.error('DataChannel error:', err);
        };

        dc.onopen = () => {
          startTime = Date.now();
          if ($('recv-status')) $('recv-status').textContent = 'Connected! Receiving files…';
        };
      };

      // 3. Gather ICE candidates
      const iceCandidates = [];
      const iceGatheringDone = new Promise((resolve) => {
        pc.onicecandidate = (e) => {
          if (e.candidate) {
            iceCandidates.push(e.candidate.toJSON());
          } else {
            resolve();
          }
        };
        setTimeout(resolve, 5000);
      });

      // 4. Set remote offer and create answer
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      // Wait for ICE gathering
      await iceGatheringDone;

      // 5. Send answer back to signaling server
      const res = await fetch('/api/signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'answer',
          key,
          answer: pc.localDescription.toJSON(),
          candidates: iceCandidates,
        }),
      });

      if (!res.ok) throw new Error('Failed to send answer');

    } catch (err) {
      console.error('WebRTC connect error:', err);
      showState('error');
      animateIn($('recv-error'));
    }
  }

  /* ── Handle incoming DataChannel messages ─────────────────────────────── */
  function handleDataChannelMessage(data) {
    if (typeof data === 'string') {
      // Control message (JSON)
      const msg = JSON.parse(data);

      if (msg.type === 'meta') {
        fileCount = msg.fileCount;
        totalSize = msg.totalSize;
        totalReceived = 0;
        receivedFiles = [];
      }

      if (msg.type === 'fileStart') {
        currentFile = {
          name: msg.name,
          size: msg.size,
          mimeType: msg.mimeType,
        };
        currentChunks = [];
        currentSize = 0;
      }

      if (msg.type === 'fileEnd') {
        // Assemble file from chunks
        const blob = new Blob(currentChunks, { type: currentFile.mimeType });
        receivedFiles.push({
          name: currentFile.name,
          blob,
        });
        currentFile = null;
        currentChunks = [];
        currentSize = 0;
      }

      if (msg.type === 'allDone') {
        // All files received — trigger downloads
        finishDownload();
      }

    } else {
      // Binary data — file chunk
      currentChunks.push(data);
      currentSize += data.byteLength;
      totalReceived += data.byteLength;

      // Update progress
      const pct = totalSize > 0 ? Math.round((totalReceived / totalSize) * 100) : 0;
      const elapsed = (Date.now() - startTime) / 1000;
      const speed = elapsed > 0 ? totalReceived / elapsed : 0;

      if ($('recv-bar')) $('recv-bar').style.width = pct + '%';
      if ($('recv-pct')) $('recv-pct').textContent = pct + '%';
      if ($('recv-speed')) $('recv-speed').textContent = fmtSpeed(speed);
    }
  }

  function finishDownload() {
    // Trigger browser downloads for all files
    receivedFiles.forEach(({ name, blob }) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    });

    showState('done');
    animateIn($('recv-done'));

    // Cleanup
    if (pc) { try { pc.close(); } catch {} pc = null; }
  }

  function resetRecv() {
    if (pc) { try { pc.close(); } catch {} pc = null; }
    receivedFiles = [];
    currentFile = null;
    currentChunks = [];
    currentKey = '';

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
    if ($('recv-speed')) $('recv-speed').textContent = '';
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
  return { initRecv, connectAndReceive };
})();

/* ══════════════════════════════════════════════════════════════════════════════
   NEARBY MANAGER — LAN device discovery & instant transfer
══════════════════════════════════════════════════════════════════════════════ */
const nearbyMgr = (() => {
  let sse = null;
  let myDeviceId = '';
  let nearbyDevices = [];
  let pendingTransfer = null; // incoming transfer request

  /* ── Device name from User-Agent ─────────────────────────────────────── */
  function getDeviceName() {
    const ua = navigator.userAgent;
    // Mobile devices
    if (/iPhone/.test(ua)) return 'iPhone';
    if (/iPad/.test(ua)) return 'iPad';
    if (/Android/.test(ua)) {
      const match = ua.match(/;\s*([^;)]+)\s*Build/);
      if (match) return match[1].trim().slice(0, 16);
      return 'Android';
    }
    // Desktop browsers
    const os = /Mac/.test(ua) ? 'Mac' : /Win/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Desktop';
    const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome/.test(ua) ? 'Chrome' : /Firefox/.test(ua) ? 'Firefox' : /Safari/.test(ua) ? 'Safari' : 'Browser';
    return `${browser} · ${os}`;
  }

  /* ── Avatar colors (deterministic from name) ─────────────────────────── */
  const AVATAR_COLORS = [
    '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981',
    '#6366f1', '#ef4444', '#14b8a6', '#f97316', '#06b6d4',
  ];
  function avatarColor(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash) + name.charCodeAt(i);
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
  }
  function avatarInitials(name) {
    const parts = name.split(/[·\s-]+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }

  /* ── Initialize ──────────────────────────────────────────────────────── */
  function initNearby() {
    const deviceName = getDeviceName();

    // Connect to nearby SSE
    sse = new EventSource(`/api/nearby?name=${encodeURIComponent(deviceName)}`);

    sse.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === 'registered') {
          myDeviceId = msg.deviceId;
        }

        if (msg.type === 'devices') {
          nearbyDevices = msg.devices || [];
          renderNearbyDevices();
        }

        if (msg.type === 'transfer-request') {
          showTransferNotification(msg);
        }

      } catch { /* ignore parse errors */ }
    };

    sse.onerror = () => {
      // Will auto-reconnect
    };

    // Setup notification button handlers
    $('btn-accept-transfer')?.addEventListener('click', acceptTransfer);
    $('btn-decline-transfer')?.addEventListener('click', declineTransfer);
  }

  /* ── Render nearby device list ───────────────────────────────────────── */
  function renderNearbyDevices() {
    const container = $('nearby-devices');
    const countEl = $('nearby-count');
    const emptyEl = $('nearby-empty');
    if (!container) return;

    countEl.textContent = nearbyDevices.length;

    if (nearbyDevices.length === 0) {
      container.innerHTML = '';
      container.appendChild(emptyEl || createEmptyEl());
      show(emptyEl);
      return;
    }

    if (emptyEl) hide(emptyEl);

    container.innerHTML = nearbyDevices.map((dev) => {
      const color = avatarColor(dev.name);
      const initials = avatarInitials(dev.name);
      return `
        <div class="nearby-device" data-device-id="${dev.id}" onclick="nearbyMgr.sendToDevice('${dev.id}', '${escapeHtml(dev.name)}')">
          <div class="nearby-avatar" style="background: ${color}">${initials}</div>
          <span class="nearby-name">${escapeHtml(dev.name)}</span>
        </div>`;
    }).join('');
  }

  function createEmptyEl() {
    const el = document.createElement('div');
    el.id = 'nearby-empty';
    el.className = 'nearby-empty';
    el.innerHTML = '<div class="nearby-scan"><div class="scan-ring"></div></div><span>Scanning for devices…</span>';
    return el;
  }

  /* ── Send to a nearby device (click handler) ─────────────────────────── */
  async function sendToDevice(deviceId, deviceName) {
    const currentFiles = sendMgr.getFiles();

    if (!currentFiles || currentFiles.length === 0) {
      // No files selected yet — open file picker first
      const fileInput = $('file-input');
      if (!fileInput) return;

      // One-time listener for file selection
      const handler = async () => {
        fileInput.removeEventListener('change', handler);
        const selected = Array.from(fileInput.files);
        if (selected.length === 0) return;
        sendMgr.addFiles(selected);
        await initiateSendToDevice(deviceId, deviceName);
      };
      fileInput.addEventListener('change', handler);
      fileInput.click();
      return;
    }

    await initiateSendToDevice(deviceId, deviceName);
  }

  async function initiateSendToDevice(deviceId, deviceName) {
    // Start the normal send flow — it creates the signaling room
    // Then notify the target device with the key
    try {
      // Switch to Send tab
      const sendTab = document.querySelector('[data-tab="send"]');
      if (sendTab) sendTab.click();

      // Start the P2P send flow
      await sendMgr.startSend();

      // Wait a moment for the key to be generated
      await new Promise(r => setTimeout(r, 500));

      // Get the generated key from the UI
      const keyDigits = $('send-key-digits');
      if (!keyDigits) return;
      const key = Array.from(keyDigits.querySelectorAll('.key-digit')).map(d => d.textContent).join('');
      if (!key || key.length !== 6) return;

      // Get file metadata
      const files = sendMgr.getFiles();
      const filesMeta = files.map(({ file }) => ({
        name: file.name,
        size: file.size,
        type: file.type || 'application/octet-stream',
      }));

      // Notify the target device
      await fetch('/api/nearby', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'transfer-request',
          targetId: deviceId,
          senderId: myDeviceId,
          senderName: getDeviceName(),
          key,
          filesMeta,
        }),
      });

    } catch (err) {
      console.error('Send to device error:', err);
    }
  }

  /* ── Incoming transfer notification ──────────────────────────────────── */
  function showTransferNotification(msg) {
    pendingTransfer = msg;

    $('transfer-notify-from').textContent = `from ${msg.fromName}`;
    $('transfer-notify-files').innerHTML = msg.filesMeta.map(
      (f) => fileRowHTML(f.name, f.size)
    ).join('');

    show($('transfer-notify'));
  }

  function acceptTransfer() {
    if (!pendingTransfer) return;
    hide($('transfer-notify'));

    // Switch to Receive tab
    const recvTab = document.querySelector('[data-tab="receive"]');
    if (recvTab) recvTab.click();

    // Auto-fill the key and trigger receive
    const keyInput = $('key-input');
    if (keyInput) {
      keyInput.value = pendingTransfer.key;
      keyInput.dispatchEvent(new Event('input'));
    }

    // Auto-click receive button after a short delay
    setTimeout(() => {
      const btnReceive = $('btn-receive');
      if (btnReceive && !btnReceive.disabled) btnReceive.click();
    }, 300);

    pendingTransfer = null;
  }

  function declineTransfer() {
    hide($('transfer-notify'));
    pendingTransfer = null;
  }

  return { initNearby, sendToDevice };
})();

/* ══════════════════════════════════════════════════════════════════════════════
   BOOTSTRAP — wait for DOM then init
══════════════════════════════════════════════════════════════════════════════ */
function bootstrap() {
  initTabs();
  sendMgr.initSend();
  recvMgr.initRecv();
  nearbyMgr.initNearby();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
