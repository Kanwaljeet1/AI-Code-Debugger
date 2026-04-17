const USERS_KEY = 'cm_local_users_v1';
let memoryUsers = [];

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function loadUsers() {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
  } catch {
    return memoryUsers;
  }
}

function saveUsers(users) {
  try {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  } catch {
    memoryUsers = users;
  }
}

async function sha256(text) {
  const input = String(text);
  // Use WebCrypto when available (secure contexts like localhost/https).
  if (globalThis.crypto?.subtle) {
    const data = new TextEncoder().encode(input);
    const hash = await globalThis.crypto.subtle.digest('SHA-256', data);
    const bytes = Array.from(new Uint8Array(hash));
    return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback hash for non-secure contexts (demo-only, not cryptographically secure).
  let h = 5381;
  for (let i = 0; i < input.length; i += 1) h = ((h << 5) + h) ^ input.charCodeAt(i);
  return `djb2x:${(h >>> 0).toString(16)}`;
}

export async function registerLocal({ email, password, displayName = '' }) {
  const normalized = normalizeEmail(email);
  if (!normalized || !password) {
    const err = new Error('Email and password required');
    err.code = 'BAD_INPUT';
    throw err;
  }
  const users = loadUsers();
  const exists = users.some((u) => normalizeEmail(u.email) === normalized);
  if (exists) {
    const err = new Error('Email already registered (local)');
    err.code = 'EMAIL_EXISTS';
    throw err;
  }
  const passwordHash = await sha256(password);
  const user = {
    id: `local:${normalized}`,
    email: normalized,
    displayName,
    passwordHash,
    createdAt: new Date().toISOString()
  };
  users.push(user);
  saveUsers(users);
  return { id: user.id, email: user.email, displayName: user.displayName };
}

export async function loginLocal({ email, password }) {
  const normalized = normalizeEmail(email);
  if (!normalized || !password) {
    const err = new Error('Email and password required');
    err.code = 'BAD_INPUT';
    throw err;
  }
  const users = loadUsers();
  const user = users.find((u) => normalizeEmail(u.email) === normalized);
  if (!user) {
    const err = new Error('Invalid credentials (local)');
    err.code = 'INVALID_CREDENTIALS';
    throw err;
  }
  const passwordHash = await sha256(password);
  if (passwordHash !== user.passwordHash) {
    const err = new Error('Invalid credentials (local)');
    err.code = 'INVALID_CREDENTIALS';
    throw err;
  }
  return { id: user.id, email: user.email, displayName: user.displayName };
}
