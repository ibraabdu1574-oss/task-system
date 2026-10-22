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
  const body = text ? (JSON.parse(text) as unknown) : null;
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

/** رفع ملف (multipart) — بلا Content-Type يدوي حتى يضبط المتصفح الحدّ (boundary) */
export async function upload<T>(path: string, file: File, field = 'file', retry = true): Promise<T> {
  const s = loadSession();
  const fd = new FormData();
  fd.append(field, file, file.name);
  const headers: Record<string, string> = {};
  if (s?.accessToken) headers.Authorization = `Bearer ${s.accessToken}`;
  const res = await fetch(`${BASE}${path}`, { method: 'POST', body: fd, headers });
  if (res.status === 401 && retry && s?.refreshToken) {
    const next = await refresh();
    if (next) return upload<T>(path, file, field, false);
  }
  const text = await res.text();
  const body = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) throw new ApiError(res.status, messageOf(body, `خطأ ${res.status}`), body);
  return body as T;
}

/** تنزيل ملف محمي (يحتاج Authorization) ثم حفظه عبر رابط مؤقت */
export async function download(path: string, fileName: string, retry = true): Promise<void> {
  const s = loadSession();
  const headers: Record<string, string> = {};
  if (s?.accessToken) headers.Authorization = `Bearer ${s.accessToken}`;
  const res = await fetch(`${BASE}${path}`, { headers });
  if (res.status === 401 && retry && s?.refreshToken) {
    const next = await refresh();
    if (next) return download(path, fileName, false);
  }
  if (!res.ok) {
    const text = await res.text();
    let body: unknown = null;
    try { body = text ? JSON.parse(text) : null; } catch { /* ليس JSON */ }
    throw new ApiError(res.status, messageOf(body, `خطأ ${res.status}`), body);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
