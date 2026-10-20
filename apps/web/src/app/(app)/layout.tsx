'use client';

import type { ReactNode } from 'react';
import { AuthProvider } from '@/lib/auth';
import { Shell } from '@/components/Shell';

/** كل ما تحت (app) يتطلب جلسة — بلا جلسة يُحوَّل إلى /login */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthProvider requireAuth>
      <Shell>{children}</Shell>
    </AuthProvider>
  );
}
