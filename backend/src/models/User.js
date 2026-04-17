import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['employee'], default: 'employee' },
    displayName: { type: String, default: '' }
  },
  { timestamps: true }
);

export default mongoose.model('User', userSchema);
