import { Router } from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { issueToken } from '../middleware/auth.js';
import { runtimeState } from '../runtimeState.js';
import { createLocalUser, findLocalUserByEmail } from '../services/localAuthStore.js';

const router = Router();

router.post('/register', async (req, res) => {
  const { email, password, displayName } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Email and password required' });
  const passwordHash = await bcrypt.hash(password, 10);

  if (runtimeState.mongoReady) {
    const existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ message: 'Email already registered' });
    const user = await User.create({ email, passwordHash, role: 'employee', displayName });
    const token = issueToken(user);
    return res.json({ token, user: { id: user._id, email: user.email, role: 'employee', displayName: user.displayName } });
  }

  try {
    const user = await createLocalUser({ email, passwordHash, displayName });
    const token = issueToken(user);
    return res.json({ token, user: { id: user.id, email: user.email, role: 'employee', displayName: user.displayName } });
  } catch (err) {
    if (err.code === 'EMAIL_EXISTS') return res.status(409).json({ message: err.message });
    return res.status(500).json({ message: 'Registration failed', error: err.message });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Email and password required' });

  if (runtimeState.mongoReady) {
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ message: 'Invalid credentials' });
    const token = issueToken(user);
    return res.json({ token, user: { id: user._id, email: user.email, role: 'employee', displayName: user.displayName } });
  }

  const user = await findLocalUserByEmail(email);
  if (!user) return res.status(401).json({ message: 'Invalid credentials' });
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ message: 'Invalid credentials' });
  const token = issueToken(user);
  return res.json({ token, user: { id: user.id, email: user.email, role: 'employee', displayName: user.displayName } });
});

export default router;
