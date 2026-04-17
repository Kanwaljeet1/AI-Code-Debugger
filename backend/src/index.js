import http from 'http';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';

import authRoutes from './routes/auth.js';
import roomRoutes from './routes/rooms.js';
import aiRoutes from './routes/ai.js';
import githubRoutes from './routes/github.js';
import { registerRoomHandlers } from './realtime/roomSocket.js';
import { runtimeState } from './runtimeState.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',');

const app = express();
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: '1mb' }));

app.get('/', (_req, res) => res.json({ ok: true, name: 'CodeMate backend' }));

function requireMongo(_req, res, next) {
  if (runtimeState.mongoReady) return next();
  return res.status(503).json({
    message: 'MongoDB is not connected. Set MONGO_URI and restart to enable collab rooms.'
  });
}

// Auth supports a local-file fallback when Mongo is unavailable.
app.use('/auth', authRoutes);
app.use('/rooms', requireMongo, roomRoutes);
app.use('/ai', aiRoutes);
app.use('/github', githubRoutes);

const port = process.env.PORT || 4000;
// Optional override. If unset, bind on the default interface(s).
const host = process.env.HOST?.trim();
const server = http.createServer(app);
server.on('error', (err) => {
  console.error(`API server failed to start on port ${port}:`, err.message);
  process.exit(1);
});

const io = new Server(server, {
  cors: { origin: allowedOrigins, methods: ['GET', 'POST'] }
});

app.set('io', io);

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next();
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
    socket.handshake.auth.tokenPayload = payload;
  } catch (err) {
    console.warn('Socket auth failed', err.message);
  }
  next();
});

registerRoomHandlers(io);

const rawMongoUri = process.env.MONGO_URI?.trim();
// Treat template placeholder values as "unset" to avoid confusing startup errors.
const mongoUri = rawMongoUri && !rawMongoUri.includes('<') && !rawMongoUri.includes('>') ? rawMongoUri : '';

async function start() {
  if (mongoUri) {
    try {
      await mongoose.connect(mongoUri, {
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 5000
      });
      runtimeState.mongoReady = true;
      console.log('Mongo connected:', mongoUri);
    } catch (err) {
      runtimeState.mongoReady = false;
      console.warn('Mongo connection failed. Starting without auth/rooms.', err.message);
    }
  } else {
    console.warn('MONGO_URI not set. Starting without auth/rooms.');
  }
  if (host) {
    const printableHost = host.includes(':') ? `[${host}]` : host;
    server.listen(port, host, () => console.log(`API listening on http://${printableHost}:${port}`));
  } else {
    server.listen(port, () => console.log(`API listening on http://localhost:${port}`));
  }
}

start().catch((err) => {
  console.error('Failed to start', err);
  process.exit(1);
});
