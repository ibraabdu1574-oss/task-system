'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { SessionUser } from '@task/shared';
import { api, loadSession, logout as apiLogout, saveSession } from './api';

interface AuthCtx {
  user: SessionUser | null;
  loading: boolean;
  signOut: () => Promise<void>;
}
const Ctx = createContext<AuthCtx>({ user: null, loading: true, signOut: async () => undefined });

/** يحمّل الجلسة من التخزين ويتحقق منها بـ /auth/me؛ بلا جلسة ⇒ إلى صفحة الدخول */
export function AuthProvider({ children, requireAuth }: { children: ReactNode; requireAuth?: boolean }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    let alive = true;
    (async () => {
      const s = loadSession();
      if (!s) { if (alive) setLoading(false); if (requireAuth) router.replace('/login'); return; }
      try {
        const me = await api<SessionUser>('/auth/me');
        if (!alive) return;
        saveSession({ ...s, user: me });
        setUser(me);
      } catch {
        saveSession(null);
        if (requireAuth) router.replace('/login');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [requireAuth, router]);

  const signOut = useCallback(async () => {
    await apiLogout();
    setUser(null);
    router.replace('/login');
  }, [router]);

  return <Ctx.Provider value={{ user, loading, signOut }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
