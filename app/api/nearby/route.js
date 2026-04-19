/* ─── Nearby Devices: SSE-based LAN presence discovery ─────────────────── */
/* Devices on the same public IP are grouped as "nearby" (same WiFi/LAN).   */
/* Each client connects via SSE, gets a list of nearby peers, and can       */
/* initiate instant transfers without sharing a 6-digit key.                */

export const dynamic = 'force-dynamic';

// Global device registry: deviceId → { id, name, ip, listeners[], lastSeen }
if (!globalThis.__nearbyDevices) {
  globalThis.__nearbyDevices = new Map();
}
const devices = globalThis.__nearbyDevices;

function getClientIP(request) {
  // Check forwarded headers first (behind proxy/Vercel)
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  const real = request.headers.get('x-real-ip');
  if (real) return real;
  // Fallback for local dev
  return '127.0.0.1';
}

function generateDeviceId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function cleanStale() {
  const now = Date.now();
  for (const [id, dev] of devices) {
    if (now - dev.lastSeen > 2 * 60 * 1000) { // 2 min stale
      devices.delete(id);
    }
  }
}

// Get all devices on the same IP (same LAN)
function getNearbyDevices(ip, excludeId) {
  const nearby = [];
  for (const [id, dev] of devices) {
    if (dev.ip === ip && id !== excludeId) {
      nearby.push({ id: dev.id, name: dev.name });
    }
  }
  return nearby;
}

// Broadcast updated device list to all devices on a given IP
function broadcastToIP(ip) {
  for (const [id, dev] of devices) {
    if (dev.ip === ip && dev.listeners) {
      const nearby = getNearbyDevices(ip, id);
      dev.listeners.forEach((send) => {
        try { send({ type: 'devices', devices: nearby }); }
        catch { /* closed */ }
      });
    }
  }
}

/* ─── GET: SSE — register device and receive nearby updates ─────────────── */
export async function GET(request) {
  cleanStale();

  const { searchParams } = new URL(request.url);
  const deviceName = searchParams.get('name') || 'Unknown Device';
  const ip = getClientIP(request);
  const deviceId = generateDeviceId();

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Register this device
      devices.set(deviceId, {
        id: deviceId,
        name: deviceName,
        ip,
        listeners: [],
        lastSeen: Date.now(),
      });

      const send = (msg) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(msg)}\n\n`));
        } catch { /* stream closed */ }
      };

      devices.get(deviceId).listeners.push(send);

      // Send device ID to client
      send({ type: 'registered', deviceId });

      // Send current nearby devices
      const nearby = getNearbyDevices(ip, deviceId);
      send({ type: 'devices', devices: nearby });

      // Broadcast to all nearby that a new device joined
      broadcastToIP(ip);

      // Heartbeat
      const heartbeat = setInterval(() => {
        const dev = devices.get(deviceId);
        if (dev) dev.lastSeen = Date.now();
        try { send({ type: 'ping' }); }
        catch { clearInterval(heartbeat); }
      }, 20_000);

      // Cleanup on disconnect
      request.signal.addEventListener('abort', () => {
        clearInterval(heartbeat);
        devices.delete(deviceId);
        broadcastToIP(ip); // Notify others this device left
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

/* ─── POST: Send a transfer request to a nearby device ──────────────────── */
export async function POST(request) {
  try {
    const { action, targetId, senderId, senderName, key, filesMeta } = await request.json();

    if (action === 'transfer-request') {
      // Sender wants to send files to a specific nearby device
      const target = devices.get(targetId);
      if (!target) {
        return new Response(JSON.stringify({ error: 'Device not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Push transfer request to target device's SSE
      target.listeners.forEach((send) => {
        try {
          send({
            type: 'transfer-request',
            fromId: senderId,
            fromName: senderName,
            key,
            filesMeta,
          });
        } catch { /* closed */ }
      });

      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Nearby POST error:', err);
    return new Response(JSON.stringify({ error: 'Failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
