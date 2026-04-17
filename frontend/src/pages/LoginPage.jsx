import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api/client.js';
import { useAuth } from '../store/auth.js';
import { loginLocal, registerLocal } from '../utils/localAuth.js';

export default function LoginPage({ defaultMode = 'login' }) {
  const [mode, setMode] = useState(defaultMode);
  const [email, setEmail] = useState('employee@example.com');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState('');
  const [backendDown, setBackendDown] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setAuth, token } = useAuth();

  useEffect(() => {
    setMode(defaultMode);
  }, [defaultMode]);

  useEffect(() => {
    const qpMode = searchParams.get('mode');
    const signupFlag = searchParams.get('signup');
    if (qpMode === 'register' || signupFlag === '1') setMode('register');
  }, [searchParams]);

  useEffect(() => {
    if (token) navigate('/', { replace: true });
  }, [token, navigate]);

  async function fallbackToLocalAuth() {
    setBackendDown(true);
    const localUser =
      mode === 'login'
        ? await loginLocal({ email, password })
        : await registerLocal({ email, password });
    setAuth(`local-token:${Date.now()}`, { ...localUser, role: 'employee' });
    navigate('/', { replace: true });
  }

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBackendDown(false);
    try {
      const endpoint = mode === 'login' ? '/auth/login' : '/auth/register';
      const { data } = await api.post(endpoint, { email, password });
      if (!data?.token || !data?.user) {
        setError('Login failed: backend returned an unexpected response.');
        return;
      }
      setAuth(data.token, data.user);
      navigate('/');
    } catch (err) {
      const msg = err.response?.data?.message;
      const status = err.response?.status;

      // If backend is unreachable or unhealthy (503/5xx), fall back to local auth so the UI stays usable.
      if (!err.response || status === 503 || (status >= 500 && status <= 599)) {
        try {
          await fallbackToLocalAuth();
          return;
        } catch (localErr) {
          setError(localErr.message || 'Backend unavailable, and local login failed.');
          return;
        }
      }

      if (msg) {
        setError(msg);
        return;
      }

      setError(err.message || 'Login failed.');
    }
  };

  const continueOffline = () => {
    // Allows using the AI Debugging Assistant even when the backend can't run.
    const normalizedEmail = String(email || 'offline@local').trim().toLowerCase();
    setAuth('offline-token', { id: `offline:${normalizedEmail}`, email: normalizedEmail, role: 'employee', displayName: '' });
    navigate('/');
  };

  return (
    <div className="panel" style={{ maxWidth: 480, margin: '40px auto' }}>
      <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ marginTop: 0, marginBottom: 6 }}>{mode === 'login' ? 'Login' : 'Create account'}</h2>
        <div className="segmented">
          <button type="button" className={mode === 'login' ? 'seg active' : 'seg'} onClick={() => setMode('login')}>Login</button>
          <button type="button" className={mode === 'register' ? 'seg active' : 'seg'} onClick={() => setMode('register')}>Sign up</button>
        </div>
      </div>
      <p className="muted">Create or sign in with your employee account.</p>
      {backendDown && (
        <div className="panel" style={{ background: '#0f1727', marginBottom: 12 }}>
          <div className="flex space-between" style={{ alignItems: 'center' }}>
            <div>
              <strong>Backend not reachable</strong>
              <div className="muted" style={{ marginTop: 4, fontSize: 12 }}>
                Using local employee auth so you can continue to Home. Rooms need the backend.
              </div>
            </div>
            <button type="button" className="button inline" onClick={continueOffline}>Continue offline</button>
          </div>
        </div>
      )}
      <form onSubmit={submit}>
        <label className="label">Email</label>
        <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
        <label className="label">Password</label>
        <input className="input" value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
        {error && <p style={{ color: '#fda4af' }}>{error}</p>}
        <div className="flex" style={{ marginTop: 12, justifyContent: 'space-between' }}>
          <button type="submit" className="button primary">{mode === 'login' ? 'Login' : 'Sign up'}</button>
          <button type="button" className="button inline" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
            {mode === 'login' ? 'Need an account?' : 'Have an account?'}
          </button>
        </div>
      </form>
    </div>
  );
}
