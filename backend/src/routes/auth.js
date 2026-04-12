import { Router } from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { issueToken } from '../middleware/auth.js';

const router = Router();

router.post('/register', async (req, res) => {
  const { email, password, role, displayName } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Email and password required' });
  const existing = await User.findOne({ email });
  if (existing) return res.status(409).json({ message: 'Email already registered' });
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({ email, passwordHash, role: role || 'student', displayName });
  const token = issueToken(user);
  res.json({ token, user: { id: user._id, email: user.email, role: user.role, displayName: user.displayName } });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user) return res.status(401).json({ message: 'Invalid credentials' });
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ message: 'Invalid credentials' });
  const token = issueToken(user);
  res.json({ token, user: { id: user._id, email: user.email, role: user.role, displayName: user.displayName } });
});

export default router;
