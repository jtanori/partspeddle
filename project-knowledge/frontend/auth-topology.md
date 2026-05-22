# VINTRACK — Frontend Auth Topology

> **Status:** Canonical Governance Document
> **Scope:** Browser authentication, SSR sessions, API authorization
> **Effective:** 2026-05-19

---

## 1. Purpose

Define how authentication flows through the frontend execution surface, from browser to backend, with clear boundaries around what Supabase Auth handles vs what backend APIs handle.

---

## 2. Core Doctrine

**Supabase Auth is the identity authority. The backend is the orchestration authority.**

| Concern | Owner | Mechanism |
|---------|-------|-----------|
| Authentication (login/logout/signup) | Supabase Auth | PKCE flow, OAuth |
| Session management | Supabase Auth | Cookie-based sessions via `@supabase/ssr` |
| User metadata | Supabase Auth | `auth.users` table |
| Business orchestration | Backend API | REST endpoints |
| Authorization (RBAC) | Backend API | JWT validation + domain logic |
| Profile data | Backend API | Identity domain |

**Critical rule:** Frontend calls Supabase ONLY for auth/session operations. ALL business operations flow through backend APIs.

---

## 3. Auth Flow

### 3.1 Login

```
User clicks "Sign In"
  → Next.js `/login` page (RSC or client)
  → Supabase Auth (PKCE flow)
  → Supabase redirects to `/auth/callback`
  → Server Route Handler exchanges code for session
  → HttpOnly cookie set
  → User redirected to dashboard
```

### 3.2 Session Refresh

```
Browser (auto)
  → `@supabase/ssr` detects expired access token
  → Refreshes via Supabase using refresh token cookie
  → New access token issued
  → Continues seamlessly
```

### 3.3 API Call with Auth

```
Frontend Server Component
  → reads session from cookie via @supabase/ssr
  → calls backend API with Authorization: Bearer <jwt>
  → backend validates JWT via Supabase
  → executes business logic

Frontend Client Component
  → reads session from AuthProvider context
  → calls backend API via lib/api/ with Authorization header
  → backend validates JWT via Supabase
```

---

## 4. Implementation

### 4.1 Supabase Clients

```typescript
// src/frontend/lib/supabase/client.ts
// Browser-only client
import { createBrowserClient } from '@supabase/ssr';

export const supabaseBrowser = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

// src/frontend/lib/supabase/server.ts
// Server-only client (RSC, Route Handlers, Middleware)
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export function createSupabaseServerClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          cookieStore.set({ name, value: '', ...options });
        },
      },
    },
  );
}
```

### 4.2 AuthProvider

```tsx
// src/frontend/components/auth-provider.tsx
'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { supabaseBrowser } from '@/frontend/lib/supabase/client';
import type { Session, User } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  isLoading: true,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabaseBrowser.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
        setSession(session);
        setIsLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, session, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
```

### 4.3 Middleware

```typescript
// src/frontend/middleware.ts
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          res.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          res.cookies.set({ name, value: '', ...options });
        },
      },
    },
  );

  const { data: { session } } = await supabase.auth.getSession();

  // Protect seller routes
  if (req.nextUrl.pathname.startsWith('/seller') && !session) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  return res;
}

export const config = {
  matcher: ['/seller/:path*', '/admin/:path*', '/account/:path*'],
};
```

### 4.4 OAuth Callback

```typescript
// src/frontend/app/auth/callback/route.ts
import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  if (code) {
    const supabase = createServerClient(/* ... */);
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=callback`);
}
```

---

## 5. Role-Based UI

```tsx
export function Navigation() {
  const { user } = useAuth();
  const role = user?.user_metadata?.role ?? 'buyer';

  return (
    <nav>
      {role === 'seller' && <Link href="/seller/dashboard">Dashboard</Link>}
      {role === 'admin' && <Link href="/admin">Admin</Link>}
    </nav>
  );
}
```

**Note:** Role metadata is set by backend webhooks, not by frontend.

---

## 6. Anti-Patterns

| Anti-Pattern | Why Forbidden |
|-------------|--------------|
| Frontend calling Supabase DB directly for business data | Bypasses backend domain logic, breaks audit trail |
| Frontend setting user roles | Security vulnerability; roles set by backend only |
| `localStorage` for session | XSS vulnerability; cookies are httpOnly |
| Storing JWT in memory without refresh | Session expires unexpectedly |
| Calling Supabase from RSC for auth | Use server client instead |

---

## 7. Review Checklist

For any PR touching auth:

- [ ] `@supabase/ssr` used for cookie-based sessions
- [ ] Middleware protects sensitive routes
- [ ] AuthProvider wraps app root
- [ ] No Supabase business queries in frontend
- [ ] OAuth callback handles errors gracefully
- [ ] Role-based UI uses metadata from Supabase
