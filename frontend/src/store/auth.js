import { create } from 'zustand';

const savedToken = typeof localStorage !== 'undefined' ? localStorage.getItem('cm_token') : '';
const savedUser = typeof localStorage !== 'undefined' ? JSON.parse(localStorage.getItem('cm_user') || 'null') : null;

export const useAuth = create((set) => ({
  user: savedUser,
  token: savedToken,
  setAuth: (token, user) => {
    set({ token, user });
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('cm_token', token || '');
      localStorage.setItem('cm_user', JSON.stringify(user || null));
    }
  },
  logout: () => {
    set({ token: '', user: null });
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('cm_token');
      localStorage.removeItem('cm_user');
    }
  }
}));
