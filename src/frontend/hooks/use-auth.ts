'use client';

import { useAuthContext } from '@/frontend/components/auth-provider';

export function useAuth() {
  return useAuthContext();
}
