import { create } from 'zustand';

function safeGetItem(key) {
  try {
    if (typeof localStorage === 'undefined') return '';
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function safeGetJson(key) {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const savedToken = safeGetItem('cm_token');
const savedUserRaw = safeGetJson('cm_user');
const savedUser = savedUserRaw ? { ...savedUserRaw, role: 'employee' } : null;

function normalizeUser(user) {
  if (!user) return null;
  return { ...user, role: 'employee' };
}

export const useAuth = create((set) => ({
  user: savedUser,
  token: savedToken,
  setAuth: (token, user) => {
    const normalized = normalizeUser(user);
    set({ token, user: normalized });
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('cm_token', token || '');
        localStorage.setItem('cm_user', JSON.stringify(normalized || null));
      }
    } catch {
      // Storage can be blocked in some browser modes; keep in-memory auth working.
    }
  },
  logout: () => {
    set({ token: '', user: null });
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('cm_token');
        localStorage.removeItem('cm_user');
      }
    } catch {
      // ignore
    }
  }
}));
