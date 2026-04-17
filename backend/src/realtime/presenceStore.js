// In-memory presence and "raise hand" tracking for live rooms.
// This keeps active connection counts and raised-hand queues so that
// routes can surface a live room dashboard without hitting Socket.IO internals.

const roomSockets = new Map(); // roomId -> Set(socketId)
const socketRoom = new Map(); // socketId -> roomId
const hands = new Map(); // roomId -> Map<userId, { userId, raisedAt }>

export function trackJoin(roomId, socketId, userId) {
  if (!roomId || !socketId) return 0;
  if (!roomSockets.has(roomId)) roomSockets.set(roomId, new Set());
  roomSockets.get(roomId).add(socketId);
  socketRoom.set(socketId, roomId);
  return getCount(roomId);
}

export function trackLeave(socketId) {
  const roomId = socketRoom.get(socketId);
  if (!roomId) return null;
  const set = roomSockets.get(roomId);
  if (set) {
    set.delete(socketId);
    if (set.size === 0) roomSockets.delete(roomId);
  }
  socketRoom.delete(socketId);
  return { roomId, count: getCount(roomId) };
}

export function getCount(roomId) {
  return roomSockets.get(roomId)?.size || 0;
}

export function getPresenceSnapshot() {
  const snapshot = {};
  roomSockets.forEach((set, roomId) => { snapshot[roomId] = set.size; });
  return snapshot;
}

export function raiseHand(roomId, userId) {
  if (!roomId || !userId) return null;
  if (!hands.has(roomId)) hands.set(roomId, new Map());
  const entry = { userId, raisedAt: new Date() };
  hands.get(roomId).set(userId, entry);
  return entry;
}

export function lowerHand(roomId, userId) {
  const map = hands.get(roomId);
  if (!map) return;
  if (userId) map.delete(userId);
  if (!userId || map.size === 0) hands.delete(roomId);
}

export function getHands(roomId) {
  const map = hands.get(roomId);
  if (!map) return [];
  return Array.from(map.values()).sort((a, b) => new Date(a.raisedAt) - new Date(b.raisedAt));
}
