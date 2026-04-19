import { NextResponse } from 'next/server';

/* ─── In-Memory Room Store ─────────────────────────────────────────────────── */
// Each room: { key, offer, filesMeta, answer, candidates, senderStream, createdAt }
// globalThis ensures the Map persists across hot reloads in dev
if (!globalThis.__signalRooms) {
  globalThis.__signalRooms = new Map();
}
const rooms = globalThis.__signalRooms;

// Clean up rooms older than 10 minutes
function cleanExpired() {
  const now = Date.now();
  for (const [key, room] of rooms) {
    if (now - room.createdAt > 10 * 60 * 1000) {
      rooms.delete(key);
    }
  }
}

// Generate a unique 6-digit key
function generateKey() {
  let key;
  let attempts = 0;
  do {
    key = String(Math.floor(Math.random() * 900_000) + 100_000);
    attempts++;
  } while (rooms.has(key) && attempts < 100);
  return attempts < 100 ? key : null;
}

/* ─── POST: Create room (sender) or submit answer (receiver) ────────────── */
export async function POST(request) {
  cleanExpired();

  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'create') {
      // Sender creates a room with their SDP offer + file metadata
      const { offer, filesMeta } = body;

      if (!offer || !filesMeta) {
        return NextResponse.json({ error: 'Missing offer or filesMeta' }, { status: 400 });
      }

      const key = generateKey();
      if (!key) {
        return NextResponse.json({ error: 'Could not generate unique key' }, { status: 500 });
      }

      rooms.set(key, {
        key,
        offer,
        filesMeta,
        answer: null,
        candidates: [],
        senderListeners: [],   // SSE listeners waiting for answer
        createdAt: Date.now(),
      });

      return NextResponse.json({ key });
    }

    if (action === 'answer') {
      // Receiver submits their SDP answer + ICE candidates
      const { key, answer, candidates } = body;

      if (!key || !answer) {
        return NextResponse.json({ error: 'Missing key or answer' }, { status: 400 });
      }

      const room = rooms.get(key);
      if (!room) {
        return NextResponse.json({ error: 'Room not found' }, { status: 404 });
      }

      room.answer = answer;
      room.candidates = candidates || [];

      // Notify all SSE listeners (the sender)
      room.senderListeners.forEach((listener) => {
        try {
          listener({
            type: 'answer',
            answer: room.answer,
            candidates: room.candidates,
          });
        } catch { /* listener may be closed */ }
      });

      return NextResponse.json({ ok: true });
    }

    if (action === 'ice') {
      // Late ICE candidate from receiver
      const { key, candidate } = body;

      if (!key || !candidate) {
        return NextResponse.json({ error: 'Missing key or candidate' }, { status: 400 });
      }

      const room = rooms.get(key);
      if (!room) {
        return NextResponse.json({ error: 'Room not found' }, { status: 404 });
      }

      room.candidates.push(candidate);

      // Push to sender's SSE stream
      room.senderListeners.forEach((listener) => {
        try {
          listener({ type: 'ice', candidate });
        } catch { /* listener may be closed */ }
      });

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Signal error:', error);
    return NextResponse.json({ error: 'Signal failed' }, { status: 500 });
  }
}

/* ─── GET: Retrieve room data (receiver checks for offer) ───────────────── */
export async function GET(request) {
  cleanExpired();

  const { searchParams } = new URL(request.url);
  const key = searchParams.get('key');

  if (!key || key.length !== 6) {
    return NextResponse.json({ exists: false }, { status: 400 });
  }

  const room = rooms.get(key);

  if (!room) {
    return NextResponse.json({ exists: false }, { status: 404 });
  }

  return NextResponse.json({
    exists: true,
    offer: room.offer,
    filesMeta: room.filesMeta,
  });
}
