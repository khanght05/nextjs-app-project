import { NextResponse } from 'next/server';
import { getEmailForToken, tasksState } from '@/lib/store';

export async function GET(request) {
  const email = getEmailForToken(request);
  if (!email) {
    return NextResponse.json({ error: 'Chưa đăng nhập hoặc token không hợp lệ.' }, { status: 401 });
  }
  return NextResponse.json(tasksState.tasks.filter((t) => t.ownerEmail === email));
}

export async function POST(request) {
  const email = getEmailForToken(request);
  if (!email) {
    return NextResponse.json({ error: 'Chưa đăng nhập hoặc token không hợp lệ.' }, { status: 401 });
  }
  const { text } = await request.json();
  if (!text || !text.trim()) {
    return NextResponse.json({ error: 'Thiếu nội dung việc cần làm.' }, { status: 400 });
  }
  const task = { id: tasksState.nextId++, text: text.trim(), done: false, ownerEmail: email };
  tasksState.tasks.push(task);
  return NextResponse.json(task, { status: 201 });
}
