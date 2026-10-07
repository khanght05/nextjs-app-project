import { NextResponse } from 'next/server';
import { sessions } from '@/lib/store';

export async function POST(request) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (token) sessions.delete(token);
  return NextResponse.json({ ok: true });
}
