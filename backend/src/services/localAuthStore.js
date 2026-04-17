import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const LOCAL_AUTH_FILENAME = '.local-auth.json';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

async function readJson(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

async function writeJsonAtomic(filePath, data) {
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmpPath, filePath);
}

export function getLocalAuthPath() {
  // Keep the local auth store alongside backend/.env for easy discovery.
  return path.resolve(__dirname, `../../${LOCAL_AUTH_FILENAME}`);
}

export async function loadLocalAuth() {
  const filePath = getLocalAuthPath();
  const parsed = await readJson(filePath);
  if (!parsed || typeof parsed !== 'object') return { users: [] };
  if (!Array.isArray(parsed.users)) return { users: [] };
  return { users: parsed.users };
}

export async function findLocalUserByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const store = await loadLocalAuth();
  return store.users.find((u) => normalizeEmail(u.email) === normalized) || null;
}

export async function createLocalUser({ email, passwordHash, displayName }) {
  const normalized = normalizeEmail(email);
  if (!normalized) throw new Error('Email and password required');
  const filePath = getLocalAuthPath();
  const store = await loadLocalAuth();
  const existing = store.users.find((u) => normalizeEmail(u.email) === normalized);
  if (existing) {
    const err = new Error('Email already registered');
    err.code = 'EMAIL_EXISTS';
    throw err;
  }

  const user = {
    id: crypto.randomUUID(),
    email: normalized,
    displayName: displayName || '',
    passwordHash,
    createdAt: new Date().toISOString()
  };

  store.users.push(user);
  await writeJsonAtomic(filePath, store);
  return user;
}
