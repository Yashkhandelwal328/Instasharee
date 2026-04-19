/* ─── SSE Stream: Sender subscribes for real-time signaling events ──────── */

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get('key');

  if (!key || key.length !== 6) {
    return new Response('Invalid key', { status: 400 });
  }

  // Access the global rooms store
  const rooms = globalThis.__signalRooms;
  if (!rooms) {
    return new Response('Server not ready', { status: 500 });
  }

  const room = rooms.get(key);
  if (!room) {
    return new Response('Room not found', { status: 404 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Send initial heartbeat
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'connected' })}\n\n`));

      // If answer already exists (receiver was faster), send it immediately
      if (room.answer) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: 'answer',
          answer: room.answer,
          candidates: room.candidates,
        })}\n\n`));
      }

      // Register as a listener for future events
      const listener = (msg) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(msg)}\n\n`));
        } catch {
          // Stream closed
        }
      };

      room.senderListeners.push(listener);

      // Heartbeat every 15s to keep connection alive
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'ping' })}\n\n`));
        } catch {
          clearInterval(heartbeat);
        }
      }, 15_000);

      // Auto-close after 10 minutes
      const timeout = setTimeout(() => {
        clearInterval(heartbeat);
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'expired' })}\n\n`));
          controller.close();
        } catch { /* already closed */ }
      }, 10 * 60 * 1000);

      // Cleanup on abort
      request.signal.addEventListener('abort', () => {
        clearInterval(heartbeat);
        clearTimeout(timeout);
        const idx = room.senderListeners.indexOf(listener);
        if (idx > -1) room.senderListeners.splice(idx, 1);
        try { controller.close(); } catch { /* already closed */ }
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
