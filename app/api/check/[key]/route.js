import { initDB, checkTransfer } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET(request, { params }) {
  try {
    await initDB();

    const { key } = await params;

    if (!key || key.length !== 6) {
      return NextResponse.json({ exists: false });
    }

    const exists = await checkTransfer(key);

    return NextResponse.json({ exists });
  } catch (error) {
    console.error('Check error:', error);
    return NextResponse.json({ exists: false });
  }
}
