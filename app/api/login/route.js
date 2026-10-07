import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { DEMO_ACCOUNTS, sessions } from '@/lib/store';

export async function POST(request) {
  const { email, password } = await request.json();

  // Giả lập độ trễ network.
  await new Promise((r) => setTimeout(r, 400));

  const account = DEMO_ACCOUNTS.find((a) => a.email === email && a.password === password);
  if (account) {
    const token = crypto.randomBytes(16).toString('hex');
    sessions.set(token, email);
    return NextResponse.json({ token, email });
  }
  return NextResponse.json({ error: 'Email hoặc mật khẩu không đúng.' }, { status: 401 });
}
