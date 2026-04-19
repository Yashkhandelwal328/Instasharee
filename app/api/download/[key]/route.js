import { initDB, getTransfer, deleteTransfer, cleanExpired } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET(request, { params }) {
  try {
    await initDB();

    // Clean expired transfers on each request (lightweight)
    cleanExpired().catch(() => {}); // fire-and-forget

    const { key } = await params;

    if (!key || key.length !== 6) {
      return NextResponse.json({ error: 'Invalid key' }, { status: 400 });
    }

    const transfer = await getTransfer(key);

    if (!transfer) {
      return NextResponse.json({ error: 'Key not found or expired' }, { status: 404 });
    }

    const files = transfer.files;

    // Delete after download (one-time use)
    await deleteTransfer(key);

    return NextResponse.json({ files });
  } catch (error) {
    console.error('Download error:', error);
    return NextResponse.json({ error: 'Download failed' }, { status: 500 });
  }
}
