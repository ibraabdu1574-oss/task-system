'use client';

import type { LoginResponse, SessionUser } from '@task/shared';

/**
 * عميل الـ API من المتصفح — نفس الأصل عبر nginx (/api/v1)، فلا CORS ولا منفذ مكشوف.
 * الرموز في localStorage (بيئة التطوير — المرحلة 1)؛ access قصير العمر ويُجدَّد تلقائيًا بـ refresh.
 */
const BASE = process.env.NEXT_PUBLIC_API_BASE || '/api/v1';
const KEY = 'task.session';

export interface Session {
  accessToken: string;
  refreshToken: string;
  user: SessionUser;
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
  }
}

export function loadSession(): Session | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}
export function saveSession(s: Session | null) {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    /* تخزين المتصفح قد يكون معطّلًا — الجلسة تبقى في الذاكرة فقط */
  }
}

function messageOf(body: unknown, fallback: string): string {
  const m = (body as { message?: string | string[] })?.message;
  if (Array.isArray(m)) return m.join('، ');
  return m || fallback;
}

let refreshing: Promise<Session | null> | null = null;

async function refresh(): Promise<Session | null> {
  const s = loadSession();
  if (!s?.refreshToken) return null;
  if (!refreshing) {
    refreshing = fetch(`${BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: s.refreshToken }),
    })
      .then(async (r) => {
        if (!r.ok) { saveSession(null); return null; }
        const next = (await r.json()) as LoginResponse;
        saveSession(next);
        return next;
      })
      .catch(() => null)
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}

export async function api<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const s = loadSession();
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(init.headers as Record<string, string>) };
  if (s?.accessToken) headers.Authorization = `Bearer ${s.accessToken}`;
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (res.status === 401 && retry && s?.refreshToken && !path.startsWith('/auth/')) {
    const next = await refresh();
    if (next) return api<T>(path, init, false);
  }
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? (JSON.parse(text) as unknown) : null;
  } catch {
    // ردّ غير JSON (مثل صفحة 403 من جدار حماية الويب) — نعرض سببًا مفهومًا بدل «فشل الطلب»
    if (!res.ok) throw new ApiError(res.status, res.status === 403 ? 'حجب جدار حماية الويب هذا الطلب (403) — أبلغ مسؤول النظام برقم القاعدة من سجل nginx' : `خطأ ${res.status}`);
  }
  if (!res.ok) throw new ApiError(res.status, messageOf(body, `خطأ ${res.status}`), body);
  return body as T;
}

export async function login(identifier: string, password: string): Promise<Session> {
  const s = await api<LoginResponse>('/auth/login', { method: 'POST', body: JSON.stringify({ identifier, password }) }, false);
  saveSession(s);
  return s;
}

export async function logout(): Promise<void> {
  const s = loadSession();
  try {
    if (s) await api('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken: s.refreshToken }) }, false);
  } catch {
    /* حتى لو فشل الإبطال على الخادم نُنهي الجلسة محليًا */
  }
  saveSession(null);
}
