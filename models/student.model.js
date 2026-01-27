// models/student.model.js
const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema(
  {
    // Personal Information
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
      minlength: [2, 'First name must be at least 2 characters'],
      maxlength: [50, 'First name must not exceed 50 characters']
    },
    lastName: {
      type: String,
      required: [true, 'Last name is required'],
      trim: true,
      minlength: [2, 'Last name must be at least 2 characters'],
      maxlength: [50, 'Last name must not exceed 50 characters']
    },
    dateOfBirth: {
      type: Date,
      default: null
    },
    gender: {
      type: String,
      enum: {
        values: ['male', 'female', 'other'],
        message: '{VALUE} is not a valid gender'
      },
      required: [true, 'Gender is required']
    },

    // Contact Information
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
        'Please enter a valid email address'
      ]
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
      match: [
        /^\+?[0-9\s()-]{6,20}$/,
        'Please enter a valid phone number'
      ]
    },

    // Authentication
    username: {
      type: String,
      required: [true, 'Username is required'],
      unique: true,
      lowercase: true,
      trim: true,
      minlength: [3, 'Username must be at least 3 characters'],
      maxlength: [30, 'Username must not exceed 30 characters'],
      match: [
        /^[a-z0-9_.-]+$/,
        'Username can only contain lowercase letters, numbers, dots, hyphens and underscores'
      ]
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false // Don't include password in queries by default
    },

    // Profile
    profileImage: {
      type: String,
      default: null
    },

    // Academic Assignment
    schoolCampus: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Campus',
      required: [true, 'Campus is required']
    },
    studentClass: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
      required: [true, 'Class is required']
    },
    mentor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Teacher',
      default: null
    },

    // Status
    status: {
      type: String,
      enum: {
        values: ['active', 'inactive', 'suspended', 'archived'],
        message: '{VALUE} is not a valid status'
      },
      default: 'active'
    },

    // Metadata
    enrollmentDate: {
      type: Date,
      default: Date.now
    },
    lastLogin: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true, // Adds createdAt and updatedAt
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Indexes for performance
studentSchema.index({ schoolCampus: 1 });
studentSchema.index({ studentClass: 1 });
studentSchema.index({ status: 1 });
studentSchema.index({ firstName: 1, lastName: 1 });

// Virtual for full name
studentSchema.virtual('fullName').get(function () {
  return `${this.firstName} ${this.lastName}`;
});

// Pre-save middleware to ensure lowercase
studentSchema.pre('save', function (next) {
  if (this.email) {
    this.email = this.email.toLowerCase();
  }
  if (this.username) {
    this.username = this.username.toLowerCase();
  }
  next();
});

const Student = mongoose.model('Student', studentSchema);

module.exports = Student;