import Revision from '../models/Revision.js';
import Execution from '../models/Execution.js';
import { trackJoin, trackLeave, raiseHand, lowerHand, getHands, getCount } from './presenceStore.js';

export function registerRoomHandlers(io) {
  io.on('connection', (socket) => {
    const { tokenPayload } = socket.handshake.auth || {};

    socket.on('join-room', ({ roomId }) => {
      socket.join(roomId);
      socket.to(roomId).emit('presence:join', { userId: tokenPayload?.id });
      const count = trackJoin(roomId, socket.id, tokenPayload?.id);
      io.to(roomId).emit('presence:update', { roomId, count });
    });

    socket.on('code:update', ({ roomId, code, cursor }) => {
      socket.to(roomId).emit('code:update', { code, cursor, userId: tokenPayload?.id });
    });

    socket.on('chat:message', ({ roomId, message }) => {
      io.to(roomId).emit('chat:message', { message, userId: tokenPayload?.id, createdAt: new Date() });
    });

    socket.on('hand:raise', ({ roomId }) => {
      const entry = raiseHand(roomId, tokenPayload?.id);
      io.to(roomId).emit('hand:raise', entry);
    });

    socket.on('hand:lower', ({ roomId, userId }) => {
      lowerHand(roomId, userId || tokenPayload?.id);
      io.to(roomId).emit('hand:update', { roomId, hands: getHands(roomId) });
    });

    socket.on('call:signal', ({ roomId, data }) => {
      socket.to(roomId).emit('call:signal', { from: tokenPayload?.id, data });
    });

    socket.on('execution:started', async ({ roomId, execId, code, language }) => {
      const record = await Execution.create({ roomId, execId, code, language, status: 'started' });
      io.to(roomId).emit('execution:started', record);
    });

    socket.on('execution:done', async ({ roomId, execId, result }) => {
      await Execution.updateOne({ execId }, { $set: result });
      io.to(roomId).emit('execution:done', { execId, result });
    });

    socket.on('save:revision', async ({ roomId, code, language, message }) => {
      const rev = await Revision.create({ roomId, code, language, message });
      socket.to(roomId).emit('save:revision', rev);
    });

    socket.on('disconnect', () => {
      const result = trackLeave(socket.id);
      if (result?.roomId) {
        io.to(result.roomId).emit('presence:update', { roomId: result.roomId, count: getCount(result.roomId) });
      }
    });
  });
}
