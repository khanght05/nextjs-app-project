'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

function authHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function TodoPage() {
  const router = useRouter();
  const [tasks, setTasks] = useState(null); // null = loading
  const [error, setError] = useState('');
  const [newText, setNewText] = useState('');
  const [filter, setFilter] = useState('all'); // all | active | done

  const goToLogin = useCallback(() => {
    localStorage.removeItem('token');
    router.replace('/');
  }, [router]);

  const loadTasks = useCallback(async () => {
    setError('');
    try {
      const res = await fetch('/api/tasks', { headers: authHeaders() });
      if (res.status === 401) return goToLogin();
      const data = await res.json();
      setTasks(data);
    } catch (err) {
      setError('Không tải được danh sách việc cần làm.');
    }
  }, [goToLogin]);

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      goToLogin();
      return;
    }
    loadTasks();
  }, [goToLogin, loadTasks]);

  async function handleLogout() {
    await fetch('/api/logout', { method: 'POST', headers: authHeaders() });
    goToLogin();
  }

  async function handleAdd(e) {
    e.preventDefault();
    const text = newText.trim();
    if (!text) return;
    setNewText('');
    await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ text }),
    });
    loadTasks();
  }

  async function toggleDone(task) {
    await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ done: !task.done }),
    });
    loadTasks();
  }

  async function removeTask(task) {
    await fetch(`/api/tasks/${task.id}`, { method: 'DELETE', headers: authHeaders() });
    loadTasks();
  }

  const visible = (tasks || []).filter((t) =>
    filter === 'all' ? true : filter === 'done' ? t.done : !t.done,
  );

  return (
    <main>
      <header className="app-header">
        <h1>Việc cần làm</h1>
        <button type="button" onClick={handleLogout}>
          Đăng xuất
        </button>
      </header>

      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}

      <form className="add-form" onSubmit={handleAdd}>
        <label htmlFor="task-input" className="visually-hidden">
          Việc cần làm mới
        </label>
        <input
          id="task-input"
          type="text"
          placeholder="Thêm việc mới..."
          required
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
        />
        <button type="submit">Thêm</button>
      </form>

      {tasks !== null && tasks.length > 0 && (
        <div className="filter-bar" role="group" aria-label="Lọc việc cần làm">
          {[['all', 'Tất cả'], ['active', 'Đang làm'], ['done', 'Đã xong']].map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={filter === key ? 'active' : ''}
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {tasks === null && <p className="muted">Đang tải...</p>}
      {tasks !== null && tasks.length === 0 && (
        <p className="muted">Chưa có việc nào. Thêm việc đầu tiên ở trên.</p>
      )}
      {tasks !== null && visible.length > 0 && (
        <ul className="task-list">
          {visible.map((t) => (
            <li key={t.id} className={t.done ? 'done' : ''}>
              <input
                type="checkbox"
                checked={t.done}
                aria-label={`Đánh dấu "${t.text}" là ${t.done ? 'chưa xong' : 'đã xong'}`}
                onChange={() => toggleDone(t)}
              />
              <span>{t.text}</span>
              <button type="button" aria-label={`Xóa "${t.text}"`} onClick={() => removeTask(t)}>
                Xóa
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
