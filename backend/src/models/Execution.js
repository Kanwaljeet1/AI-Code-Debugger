import mongoose from 'mongoose';

const executionSchema = new mongoose.Schema(
  {
    roomId: { type: String, required: true },
    execId: { type: String, required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    language: { type: String, default: 'javascript' },
    code: { type: String, required: true },
    stdin: { type: String, default: '' },
    status: { type: String, default: 'queued' },
    stdout: { type: String, default: '' },
    stderr: { type: String, default: '' },
    time: { type: String, default: '' },
    memory: { type: String, default: '' }
  },
  { timestamps: true }
);

export default mongoose.model('Execution', executionSchema);
