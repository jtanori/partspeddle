'use client';

import { createBrowserClient } from '@supabase/ssr';
import { createContext, useContext, useEffect, useState } from 'react';
import { assertDefined } from '@/shared/utils/assert';

interface User {
  id: string;
  email?: string;
}

export interface AuthContextType {
  user: User | null;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const supabase = createBrowserClient(
      assertDefined(process.env.NEXT_PUBLIC_SUPABASE_URL, 'NEXT_PUBLIC_SUPABASE_URL is required'),
      assertDefined(
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        'NEXT_PUBLIC_SUPABASE_ANON_KEY is required'
      )
    );

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ? { id: session.user.id, email: session.user.email } : null);
      setIsLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return <AuthContext.Provider value={{ user, isLoading }}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  return useContext(AuthContext);
}
