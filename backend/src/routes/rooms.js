import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import Room from '../models/Room.js';
import Revision from '../models/Revision.js';
import Execution from '../models/Execution.js';
import { authRequired } from '../middleware/auth.js';
import { submitToJudge0 } from '../services/judge0.js';
import { getHands, raiseHand, lowerHand, getPresenceSnapshot } from '../realtime/presenceStore.js';

const router = Router();

router.post('/', authRequired, async (req, res) => {
  const roomId = uuidv4();
  const { title, language } = req.body;
  const room = await Room.create({
    roomId,
    title: title || 'New Room',
    language: language || 'javascript',
    createdBy: req.user.id,
    members: [{ userId: req.user.id, roleInRoom: 'employee', permissions: { write: true, run: true } }]
  });
  res.json({ roomId: room.roomId, title: room.title, language: room.language });
});

router.get('/active', authRequired, async (req, res) => {
  const snapshot = getPresenceSnapshot();
  const roomIds = Object.keys(snapshot);
  if (roomIds.length === 0) return res.json({ rooms: [] });
  const rooms = await Room.find({ roomId: { $in: roomIds } }).sort({ updatedAt: -1 }).lean();
  const enriched = rooms.map((r) => ({
    roomId: r.roomId,
    title: r.title,
    language: r.language,
    lastSavedAt: r.lastSavedAt,
    createdAt: r.createdAt,
    activeConnections: snapshot[r.roomId] || 0,
    handsRaised: getHands(r.roomId).length
  }));
  res.json({ rooms: enriched });
});

router.get('/:id', authRequired, async (req, res) => {
  const room = await Room.findOne({ roomId: req.params.id });
  if (!room) return res.status(404).json({ message: 'Room not found' });
  const isMember = room.members?.some((m) => m.userId?.toString() === req.user.id);
  if (!isMember) {
    room.members.push({
      userId: req.user.id,
      roleInRoom: 'employee',
      permissions: { write: true, run: true }
    });
    await room.save();
  }

  const revisions = await Revision.find({ roomId: room.roomId }).sort({ createdAt: -1 }).limit(10);
  res.json({
    room,
    revisions,
    presence: getPresenceSnapshot()[room.roomId] || 0,
    hands: getHands(room.roomId)
  });
});

router.post('/:id/save', authRequired, async (req, res) => {
  const { code, language, message } = req.body;
  if (!code) return res.status(400).json({ message: 'Missing code' });
  const room = await Room.findOne({ roomId: req.params.id });
  if (!room) return res.status(404).json({ message: 'Room not found' });
  const member = room.members?.find((m) => m.userId?.toString() === req.user.id);
  if (!member) return res.status(403).json({ message: 'Not a member of this room' });
  if (member.permissions?.write === false) return res.status(403).json({ message: 'Write is disabled in this room' });
  await Revision.create({ roomId: req.params.id, userId: req.user.id, code, language, message });
  await Room.updateOne({ roomId: req.params.id }, { $set: { language, lastSavedAt: new Date() } });
  res.json({ ok: true });
});

router.get('/:id/revisions', authRequired, async (req, res) => {
  const revisions = await Revision.find({ roomId: req.params.id }).sort({ createdAt: -1 }).limit(50);
  res.json({ revisions });
});

router.get('/:id/revisions/:revisionId', authRequired, async (req, res) => {
  const revision = await Revision.findOne({ _id: req.params.revisionId, roomId: req.params.id });
  if (!revision) return res.status(404).json({ message: 'Revision not found' });
  res.json({ revision });
});

router.post('/:id/revisions/:revisionId/restore', authRequired, async (req, res) => {
  const revision = await Revision.findOne({ _id: req.params.revisionId, roomId: req.params.id });
  if (!revision) return res.status(404).json({ message: 'Revision not found' });
  const restored = await Revision.create({
    roomId: req.params.id,
    userId: req.user.id,
    code: revision.code,
    language: revision.language,
    message: `Restored from ${revision._id.toString()}`
  });
  const io = req.app.get('io');
  io?.to(req.params.id).emit('code:update', { code: revision.code, userId: req.user.id, restore: true });
  res.json({ revision: restored });
});

router.get('/:id/hands', authRequired, async (req, res) => {
  const room = await Room.findOne({ roomId: req.params.id });
  if (!room) return res.status(404).json({ message: 'Room not found' });
  const member = room.members?.find((m) => m.userId?.toString() === req.user.id);
  if (!member) return res.status(403).json({ message: 'Not a member of this room' });
  res.json({ hands: getHands(req.params.id) });
});

router.post('/:id/hand', authRequired, async (req, res) => {
  const room = await Room.findOne({ roomId: req.params.id });
  if (!room) return res.status(404).json({ message: 'Room not found' });
  const member = room.members?.find((m) => m.userId?.toString() === req.user.id);
  if (!member) return res.status(403).json({ message: 'Not a member of this room' });
  const entry = raiseHand(req.params.id, req.user.id);
  const io = req.app.get('io');
  if (entry) io?.to(req.params.id).emit('hand:raise', entry);
  res.json({ ok: true, hand: entry });
});

router.post('/:id/hand/clear', authRequired, async (req, res) => {
  const room = await Room.findOne({ roomId: req.params.id });
  if (!room) return res.status(404).json({ message: 'Room not found' });
  const member = room.members?.find((m) => m.userId?.toString() === req.user.id);
  if (!member) return res.status(403).json({ message: 'Not a member of this room' });
  const { userId } = req.body || {};
  lowerHand(req.params.id, userId);
  const io = req.app.get('io');
  io?.to(req.params.id).emit('hand:update', { roomId: req.params.id, hands: getHands(req.params.id) });
  res.json({ ok: true });
});

router.post('/:id/run', authRequired, async (req, res) => {
  const { code, language, stdin } = req.body;
  if (!code) return res.status(400).json({ message: 'Missing code' });
  const room = await Room.findOne({ roomId: req.params.id });
  if (!room) return res.status(404).json({ message: 'Room not found' });
  const member = room.members?.find((m) => m.userId?.toString() === req.user.id);
  if (!member) return res.status(403).json({ message: 'Not a member of this room' });
  if (member.permissions?.run === false) return res.status(403).json({ message: 'Runs are disabled in this room' });
  const execId = uuidv4();
  const execRecord = await Execution.create({
    roomId: req.params.id,
    execId,
    userId: req.user.id,
    language,
    code,
    stdin,
    status: 'queued'
  });

  try {
    const result = await submitToJudge0({ code, language, stdin });
    execRecord.status = result.status?.description || 'finished';
    execRecord.stdout = result.stdout || '';
    execRecord.stderr = result.stderr || '';
    execRecord.time = result.time || '';
    execRecord.memory = result.memory || '';
    await execRecord.save();
    res.json({ execId, result: execRecord });
  } catch (err) {
    execRecord.status = 'error';
    execRecord.stderr = err.message;
    await execRecord.save();
    res.status(500).json({ message: 'Execution failed', error: err.message });
  }
});

export default router;
