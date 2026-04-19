import { initDB, storeTransfer, checkTransfer } from '@/lib/db';
import { NextResponse } from 'next/server';

/**
 * Generate a unique 6-digit key.
 */
function generateKey() {
  return String(Math.floor(Math.random() * 900_000) + 100_000);
}

/**
 * Convert an ArrayBuffer to a base64 string.
 */
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export async function POST(request) {
  try {
    await initDB();

    const formData = await request.formData();
    const files = formData.getAll('files');

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    // Convert files to base64 JSON
    const fileRecords = [];
    for (const file of files) {
      const buffer = await file.arrayBuffer();
      const base64Data = arrayBufferToBase64(buffer);
      fileRecords.push({
        name: file.name,
        size: file.size,
        type: file.type || 'application/octet-stream',
        data: base64Data,
      });
    }

    // Generate a unique 6-digit key
    let key;
    let attempts = 0;
    do {
      key = generateKey();
      const exists = await checkTransfer(key);
      if (!exists) break;
      attempts++;
    } while (attempts < 100);

    if (attempts >= 100) {
      return NextResponse.json({ error: 'Could not generate unique key' }, { status: 500 });
    }

    // Store in database (10 min expiry)
    await storeTransfer(key, fileRecords, 600);

    return NextResponse.json({ key });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
