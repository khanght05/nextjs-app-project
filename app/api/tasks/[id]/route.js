import { NextResponse } from 'next/server';
import { getEmailForToken, tasksState } from '@/lib/store';

export async function PATCH(request, { params }) {
  const email = getEmailForToken(request);
  if (!email) {
    return NextResponse.json({ error: 'Chưa đăng nhập hoặc token không hợp lệ.' }, { status: 401 });
  }
  const { id } = await params;
  const idx = tasksState.tasks.findIndex((t) => t.id === Number(id) && t.ownerEmail === email);
  if (idx === -1) {
    return NextResponse.json({ error: 'Không tìm thấy việc cần làm.' }, { status: 404 });
  }
  const { done, text } = await request.json();
  if (text !== undefined) {
    if (typeof text !== 'string' || !text.trim()) {
      return NextResponse.json({ error: 'Nội dung việc cần làm không được để trống.' }, { status: 400 });
    }
    tasksState.tasks[idx].text = text.trim();
  }
  if (done !== undefined) tasksState.tasks[idx].done = Boolean(done);
  return NextResponse.json(tasksState.tasks[idx]);
}

export async function DELETE(request, { params }) {
  const email = getEmailForToken(request);
  if (!email) {
    return NextResponse.json({ error: 'Chưa đăng nhập hoặc token không hợp lệ.' }, { status: 401 });
  }
  const { id } = await params;
  const idx = tasksState.tasks.findIndex((t) => t.id === Number(id) && t.ownerEmail === email);
  if (idx === -1) {
    return NextResponse.json({ error: 'Không tìm thấy việc cần làm.' }, { status: 404 });
  }
  tasksState.tasks.splice(idx, 1);
  return NextResponse.json({ ok: true });
}
