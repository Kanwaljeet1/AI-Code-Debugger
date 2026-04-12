import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api/client.js';
import { useAuth } from '../store/auth.js';

export default function LoginPage({ defaultMode = 'login' }) {
  const [mode, setMode] = useState(defaultMode);
  const [email, setEmail] = useState('student@example.com');
  const [password, setPassword] = useState('password123');
  const [role, setRole] = useState('student');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setAuth } = useAuth();

  useEffect(() => {
    setMode(defaultMode);
  }, [defaultMode]);

  useEffect(() => {
    const qpMode = searchParams.get('mode');
    const signupFlag = searchParams.get('signup');
    if (qpMode === 'register' || signupFlag === '1') setMode('register');
  }, [searchParams]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const endpoint = mode === 'login' ? '/auth/login' : '/auth/register';
      const { data } = await api.post(endpoint, { email, password, role });
      setAuth(data.token, data.user);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong');
    }
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
      <p className="muted">Use student or TA role to test role-based UI states.</p>
      <form onSubmit={submit}>
        <label className="label">Email</label>
        <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
        <label className="label">Password</label>
        <input className="input" value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
        {mode === 'register' && (
          <>
            <label className="label">Role</label>
            <select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="student">Student</option>
              <option value="ta">TA</option>
            </select>
          </>
        )}
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
