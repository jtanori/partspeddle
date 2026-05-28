'use client';

import Link from 'next/link';
import { useAuth } from '@/frontend/hooks/use-auth';

export function Header() {
  const { user, isLoading } = useAuth();

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '1rem 2rem',
        borderBottom: '1px solid #e5e7eb',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <Link
        href="/"
        style={{ fontSize: '1.25rem', fontWeight: 700, textDecoration: 'none', color: '#111' }}
      >
        VINTRACK
      </Link>

      <nav style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
        <Link href="/" style={{ textDecoration: 'none', color: '#374151' }}>
          Home
        </Link>
        <Link href="/search" style={{ textDecoration: 'none', color: '#374151' }}>
          Search
        </Link>

        {isLoading ? (
          <span style={{ color: '#6b7280' }}>Loading…</span>
        ) : user ? (
          <>
            <Link href="/profile" style={{ textDecoration: 'none', color: '#374151' }}>
              {user.email ?? 'Profile'}
            </Link>
            <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>Signed in</span>
          </>
        ) : (
          <Link
            href="/login"
            style={{
              textDecoration: 'none',
              color: '#fff',
              background: '#111',
              padding: '0.5rem 1rem',
              borderRadius: '0.375rem',
            }}
          >
            Sign in
          </Link>
        )}
      </nav>
    </header>
  );
}
