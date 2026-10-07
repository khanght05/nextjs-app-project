import Link from 'next/link';
import './globals.css';

export const metadata = {
  title: 'Task List (Next.js)',
  description: 'QC/UX-audit test app — Next.js + React frontend, Next.js API routes as backend.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="vi">
      <body>
        <nav className="site-nav">
          <Link href="/">Trang chủ</Link>
          <Link href="/about">Giới thiệu</Link>
          <Link href="/contact">Liên hệ</Link>
        </nav>
        {children}
      </body>
    </html>
  );
}
