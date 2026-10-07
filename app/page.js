'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (localStorage.getItem('token')) {
      router.replace('/todo');
    }
  }, [router]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!email.includes('@') || password.length < 6) {
      setError('Vui lòng nhập email hợp lệ và mật khẩu tối thiểu 6 ký tự.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Đăng nhập thất bại.');
        setPassword('');
        return;
      }
      localStorage.setItem('token', data.token);
      router.push('/todo');
    } catch (err) {
      setError('Không kết nối được máy chủ.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main>
      <h1>Đăng nhập</h1>
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      <form onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label htmlFor="email-input">Email</label>
          <input
            id="email-input"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="password-input">Mật khẩu</label>
          <input
            id="password-input"
            type="password"
            autoComplete="current-password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <button
          id="login-submit"
          type="submit"
          disabled={submitting}
          style={{ width: '100%', padding: '10px' }}
        >
          {submitting ? 'Đang đăng nhập...' : 'Đăng nhập'}
        </button>
      </form>
    </main>
  );
}
