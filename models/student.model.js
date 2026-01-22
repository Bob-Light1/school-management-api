const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema(
  {
    schoolCampus: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SchoolCampus',
      required: true,
    },

    studentClass: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
      required: true,
    },

    mentor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Mentor'
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
      required: true,
      lowercase: true,
      trim: true
    },

    email: {
      type: String,
      unique: true,
      sparse: true,
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

    gender: {
      type: String,
      enum: ['male', 'female', 'other'],
      required: true
    },

    dateOfBirth: {
      type: Date
    },

    password: {
      type: String,
      required: true,
      select: false
    },

    student_image: {
      type: String,
    },

    roles: {
      type: [String],
      default: ['STUDENT']
    },

    status: {
      type: String,
      enum: ['active', 'inactive', 'suspended', 'archived'],
      default: 'active'
    },

    admissionDate: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

// usefull Index
studentSchema.index({ schoolCampus: 1, studentClass: 1 });

module.exports = mongoose.model('Student', studentSchema);
