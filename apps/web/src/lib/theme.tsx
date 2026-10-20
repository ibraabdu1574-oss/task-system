'use client';

import { useCallback, useEffect, useState } from 'react';

type Theme = 'light' | 'dark' | null;
type Brand = 'gov' | 'calm' | 'modern';
const THEME_KEY = 'task.theme';
const BRAND_KEY = 'task.brand';

/** الوضع الداكن ونمط التصميم — كما في prototype.html (data-theme / data-brand على <html>) */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(null);
  const [brand, setBrand] = useState<Brand>('gov');

  useEffect(() => {
    try {
      const t = localStorage.getItem(THEME_KEY) as Theme;
      const b = (localStorage.getItem(BRAND_KEY) as Brand) || 'gov';
      if (t) { setTheme(t); document.documentElement.setAttribute('data-theme', t); }
      setBrand(b);
      document.documentElement.setAttribute('data-brand', b);
    } catch { /* بلا تخزين */ }
  }, []);

  const toggleTheme = useCallback(() => {
    const sysDark = typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    const isDark = theme ? theme === 'dark' : sysDark;
    const next: Theme = isDark ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem(THEME_KEY, next); } catch { /* */ }
  }, [theme]);

  const changeBrand = useCallback((b: Brand) => {
    setBrand(b);
    document.documentElement.setAttribute('data-brand', b);
    try { localStorage.setItem(BRAND_KEY, b); } catch { /* */ }
  }, []);

  return { theme, brand, toggleTheme, changeBrand };
}
