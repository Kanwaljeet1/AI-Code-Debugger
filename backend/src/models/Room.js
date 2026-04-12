import mongoose from 'mongoose';

const memberSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    roleInRoom: { type: String, enum: ['student', 'ta'], default: 'student' },
    permissions: {
      write: { type: Boolean, default: true },
      run: { type: Boolean, default: true }
    }
  },
  { _id: false }
);

const roomSchema = new mongoose.Schema(
  {
    roomId: { type: String, required: true, unique: true },
    title: { type: String, default: 'Untitled room' },
    language: { type: String, default: 'javascript' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    members: [memberSchema],
    lastSavedAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

export default mongoose.model('Room', roomSchema);
