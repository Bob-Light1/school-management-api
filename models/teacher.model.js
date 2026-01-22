const mongoose = require('mongoose');

const teacherSchema = new mongoose.Schema(
  {
    schoolCampus: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SchoolCampus',
      required: true,
    },

    firstName: {
      type: String,
      required: true,
      trim: true
    },

    lastName: {
      type: String,
      required: true,
      trim: true
    },

    username: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid Email']
    },

    phone: {
      type: String,
      required: true,
      trim: true,
      match: [/^\+?[0-9\s]{6,20}$/, 'Invalid phone number']
    },

    qualification: {
      type: String,
      required: true,
      trim: true
    },

    gender: {
      type: String,
      enum: ['male', 'female', 'other'],
      required: true
    },

    dateOfBirth: {
      type: Date
    },

    teacher_image: {
      type: String,
      required: true
    },

    password: {
      type: String,
      required: true,
      select: false
    },

    roles: {
      type: [String],
      default: ['TEACHER']
    },

    status: {
      type: String,
      enum: ['active', 'inactive', 'suspended'],
      default: 'active'
    },

    hireDate: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

// Index utiles
teacherSchema.index({ schoolCampus: 1 });

module.exports = mongoose.model('Teacher', teacherSchema);
