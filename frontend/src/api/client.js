import axios from 'axios';
import { useAuth } from '../store/auth.js';

const api = axios.create({
  // In dev, use same-origin so Vite can proxy `/auth`, `/ai`, `/rooms`, `/github`.
  // In prod, allow an explicit backend URL via `VITE_API_URL` if desired.
  baseURL: import.meta.env.DEV ? '' : (import.meta.env.VITE_API_URL || '')
});

api.interceptors.request.use((config) => {
  const token = useAuth.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
