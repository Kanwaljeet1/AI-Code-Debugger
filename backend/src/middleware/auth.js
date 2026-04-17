import jwt from 'jsonwebtoken';

export function authRequired(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ message: 'Missing auth header' });
  const [, token] = header.split(' ');
  if (!token) return res.status(401).json({ message: 'Invalid auth header' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid token' });
  }
}

export function issueToken(user) {
  const payload = { id: user._id || user.id, email: user.email, role: 'employee' };
  return jwt.sign(payload, process.env.JWT_SECRET || 'dev-secret', { expiresIn: '1d' });
}
