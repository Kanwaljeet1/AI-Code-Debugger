import http from 'http';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';

import authRoutes from './routes/auth.js';
import roomRoutes from './routes/rooms.js';
import aiRoutes from './routes/ai.js';
import { registerRoomHandlers } from './realtime/roomSocket.js';

dotenv.config();

const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',');

const app = express();
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: '1mb' }));

app.get('/', (_req, res) => res.json({ ok: true, name: 'CodeMate backend' }));
app.use('/auth', authRoutes);
app.use('/rooms', roomRoutes);
app.use('/ai', aiRoutes);

const port = process.env.PORT || 4000;
const server = http.createServer(app);

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

const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/codemate';

async function start() {
  try {
    await mongoose.connect(mongoUri);
    console.log('Mongo connected:', mongoUri);
  } catch (err) {
    console.error('Mongo connection failed. Set MONGO_URI in .env and ensure MongoDB is running.');
    throw err;
  }
  server.listen(port, () => console.log(`API listening on ${port}`));
}

start().catch((err) => {
  console.error('Failed to start', err);
  process.exit(1);
});
