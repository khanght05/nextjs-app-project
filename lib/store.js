// In-memory demo store — module-level state, shared across every API route
// handler in this dev server process. Resets on server restart. Not for
// production use, this is a QC/UX-audit test fixture.

export const DEMO_ACCOUNTS = [
  { email: 'demo@example.com', password: '123456' },
  { email: 'khanght@vng.com.vn', password: '123456' },
];

export const sessions = new Map(); // token -> email

export const tasksState = {
  nextId: 3,
  tasks: [
    { id: 1, text: 'Thử QC backend + frontend', done: false, ownerEmail: 'demo@example.com' },
    { id: 2, text: 'Kiểm tra API auth', done: true, ownerEmail: 'demo@example.com' },
  ],
};

export function getEmailForToken(request) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  return token ? sessions.get(token) : undefined;
}
