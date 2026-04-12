import mongoose from 'mongoose';

const revisionSchema = new mongoose.Schema(
  {
    roomId: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    code: { type: String, required: true },
    language: { type: String, default: 'javascript' },
    message: { type: String, default: '' }
  },
  { timestamps: true }
);

export default mongoose.model('Revision', revisionSchema);
