export default function Home() {
  return (
    <>
      {/* Background decorations */}
      <div className="bg-blob bg-blob-1" aria-hidden="true"></div>
      <div className="bg-blob bg-blob-2" aria-hidden="true"></div>
      <div className="bg-noise" aria-hidden="true"></div>

      {/* Header */}
      <header className="header">
        <a href="/" className="logo">
          <div className="logo-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          </div>
          <span className="logo-text">instashare.io</span>
        </a>
        <nav className="nav">
          <a href="#" className="nav-link">Transfer</a>
          <a href="#" className="nav-link">Product</a>
          <a href="#" className="nav-link">Pricing</a>
          <a href="#" className="nav-link">Download</a>
        </nav>
        <button className="btn-sign-in">Sign in</button>
      </header>

      {/* Main */}
      <main className="main">
        {/* Hero */}
        <div className="hero animate-fade-up">
          <div className="badge">
            <span className="badge-dot"></span>
            P2P · End-to-End Encrypted
          </div>
          <h1 className="headline">
            Transfer files<br />
            <span className="accent">instantly.</span>
          </h1>
          <p className="subline">
            No account needed. Share a 6-digit key.<br />
            Files never touch our servers.
          </p>
          <ul className="features">
            <li className="feature">
              <div className="feature-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
              </div>
              <div>
                <strong>Direct P2P Transfer</strong>
                <span>Files stream directly between devices — zero servers involved.</span>
              </div>
            </li>
            <li className="feature">
              <div className="feature-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
              <div>
                <strong>End-to-End Encrypted</strong>
                <span>WebRTC DTLS encryption. Nobody can intercept your files.</span>
              </div>
            </li>
            <li className="feature">
              <div className="feature-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="2" y1="12" x2="22" y2="12" />
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
              </div>
              <div>
                <strong>No Limits</strong>
                <span>Any file type, any size, unlimited transfers.</span>
              </div>
            </li>
          </ul>
        </div>

        {/* Transfer Card */}
        <div className="card animate-fade-up delay-200">
          {/* Tab Bar */}
          <div className="tab-bar" role="tablist">
            <button className="tab tab-active" data-tab="send" role="tab" aria-selected="true">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              Send
            </button>
            <button className="tab" data-tab="receive" role="tab" aria-selected="false">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Receive
            </button>
          </div>

          {/* Nearby Devices Section */}
          <div id="nearby-section" className="nearby-section">
            <div className="nearby-header">
              <div className="nearby-title-row">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12.55a11 11 0 0 1 14.08 0" />
                  <path d="M1.42 9a16 16 0 0 1 21.16 0" />
                  <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
                  <circle cx="12" cy="20" r="1" fill="currentColor" />
                </svg>
                <span>Nearby Devices</span>
                <span id="nearby-count" className="nearby-count">0</span>
              </div>
              <span className="nearby-hint">Same WiFi network</span>
            </div>
            <div id="nearby-devices" className="nearby-devices">
              <div id="nearby-empty" className="nearby-empty">
                <div className="nearby-scan">
                  <div className="scan-ring"></div>
                </div>
                <span>Scanning for devices…</span>
              </div>
            </div>
          </div>

          {/* Card Body */}
          <div className="card-body">
            {/* ══ SEND PANEL ══ */}
            <div id="panel-send" className="panel">
              {/* State: idle */}
              <div id="send-idle">
                <div id="drop-zone" className="drop-zone" tabIndex="0" role="button" aria-label="Select files to send">
                  <input type="file" id="file-input" multiple hidden />
                  <div className="drop-icon-wrap">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                  </div>
                  <p className="drop-text">Drop files here or <span className="drop-cta">browse</span></p>
                  <p className="drop-sub">Any file · No size limits · Direct P2P</p>
                </div>
                <ul id="file-list" className="file-list hidden"></ul>
                <button id="btn-send" className="btn-primary btn-disabled" disabled>Generate Key &amp; Send</button>
              </div>

              {/* State: connecting (setting up WebRTC) */}
              <div id="send-connecting" className="centered-panel hidden">
                <div className="spinner" aria-label="Connecting"></div>
                <p className="centered-title">Setting up P2P connection…</p>
                <p className="centered-sub">Preparing secure direct channel</p>
              </div>

              {/* State: waiting for peer */}
              <div id="send-waiting" className="centered-panel hidden">
                <p className="centered-label">Share this key with the receiver</p>
                <div id="send-key-digits" className="key-digits"></div>
                <div id="send-qr" className="qr-wrap"></div>
                <p className="expires-text">Expires in <span id="expires-count" className="expires-count">10:00</span></p>
                <div className="waiting-hint">
                  <div className="pulse-ring"></div>
                  <span>Waiting for peer to connect…</span>
                </div>
                <button id="btn-cancel-send" className="btn-secondary">Cancel</button>
              </div>

              {/* State: transferring (P2P streaming) */}
              <div id="send-transferring" className="centered-panel hidden">
                <div className="p2p-status">
                  <div className="p2p-dot p2p-dot-active"></div>
                  <span>P2P Connected — Streaming files</span>
                </div>
                <p className="progress-label">Sending files…</p>
                <div className="progress-track">
                  <div id="send-bar" className="progress-fill" style={{ width: '0%' }}></div>
                </div>
                <div className="progress-meta">
                  <span id="send-pct" className="progress-pct">0%</span>
                  <span id="send-speed" className="progress-speed"></span>
                </div>
              </div>

              {/* State: done */}
              <div id="send-done" className="centered-panel hidden">
                <div className="success-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <p className="done-title">Transfer complete!</p>
                <p id="send-done-sub" className="done-sub"></p>
                <button id="btn-send-reset" className="btn-primary">Send more files</button>
              </div>
            </div>

            {/* ══ RECEIVE PANEL ══ */}
            <div id="panel-receive" className="panel hidden">
              {/* State: idle */}
              <div id="recv-idle">
                <p className="instructions">Enter the 6-digit key from the sender</p>
                <div id="recv-digit-row" className="digit-row">
                  <div className="digit-box"></div>
                  <div className="digit-box"></div>
                  <div className="digit-box"></div>
                  <div className="digit-box"></div>
                  <div className="digit-box"></div>
                  <div className="digit-box"></div>
                </div>
                <input
                  type="text"
                  id="key-input"
                  inputMode="numeric"
                  maxLength="6"
                  placeholder="Enter 6-digit key"
                  className="key-input"
                  autoComplete="off"
                />
                <button id="btn-receive" className="btn-primary btn-icon btn-disabled" disabled>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Receive Files
                </button>
              </div>

              {/* State: searching */}
              <div id="recv-searching" className="centered-panel hidden">
                <div className="spinner" aria-label="Connecting"></div>
                <p className="centered-title">Looking for sender…</p>
                <p id="recv-searching-key" className="centered-sub"></p>
              </div>

              {/* State: found */}
              <div id="recv-found" className="centered-panel hidden">
                <p className="centered-title">Files ready to receive</p>
                <ul id="recv-file-list" className="file-list"></ul>
                <button id="btn-download" className="btn-primary btn-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  <span id="btn-download-label">Download</span>
                </button>
              </div>

              {/* State: downloading (P2P receiving) */}
              <div id="recv-downloading" className="centered-panel hidden">
                <div className="p2p-status">
                  <div className="p2p-dot p2p-dot-active"></div>
                  <span id="recv-status">Establishing P2P connection…</span>
                </div>
                <p className="progress-label">Receiving…</p>
                <div className="progress-track">
                  <div id="recv-bar" className="progress-fill" style={{ width: '0%' }}></div>
                </div>
                <div className="progress-meta">
                  <span id="recv-pct" className="progress-pct">0%</span>
                  <span id="recv-speed" className="progress-speed"></span>
                </div>
              </div>

              {/* State: done */}
              <div id="recv-done" className="centered-panel hidden">
                <div className="success-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <p className="done-title">Download complete!</p>
                <p className="done-sub">Files saved to your device</p>
                <button id="btn-recv-reset" className="btn-primary">Receive more</button>
              </div>

              {/* State: error */}
              <div id="recv-error" className="centered-panel hidden">
                <div className="error-icon">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </div>
                <p className="done-title">Key not found</p>
                <p className="done-sub">The key may have expired or be invalid.</p>
                <button id="btn-recv-error-reset" className="btn-primary">Try again</button>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Incoming Transfer Request Notification */}
      <div id="transfer-notify" className="transfer-notify hidden">
        <div className="transfer-notify-card">
          <div className="transfer-notify-header">
            <div className="transfer-notify-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </div>
            <div>
              <p className="transfer-notify-title">Incoming Transfer</p>
              <p id="transfer-notify-from" className="transfer-notify-from"></p>
            </div>
          </div>
          <ul id="transfer-notify-files" className="file-list"></ul>
          <div className="transfer-notify-actions">
            <button id="btn-accept-transfer" className="btn-primary btn-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Accept
            </button>
            <button id="btn-decline-transfer" className="btn-secondary">Decline</button>
          </div>
        </div>
      </div>

      <footer className="footer">
        Our never-ending goal is to make file transfer <em>Easier, Faster, and Safer.</em>
      </footer>
    </>
  );
}
