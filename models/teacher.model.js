const mongoose = require('mongoose');

const teacherSchema = new mongoose.Schema(
  {
    // Academic Assignment
    schoolCampus: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Campus',
      required: [true, 'Campus is required'],
      index: true
    },

    subjects: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subject'
    }],

    classes: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class'
    }],

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
      validate: {
        validator: function(value) {
          return !value || value < new Date();
        },
        message: 'Date of birth cannot be in the future'
      }
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
      unique: true,
      sparse: true,
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
      select: false
    },

    // Professional Information
    qualification: {
      type: String,
      required: [true, 'Qualification is required'],
      trim: true,
      maxlength: [100, 'Qualification must not exceed 100 characters']
    },

    specialization: {
      type: String,
      trim: true,
      maxlength: [100, 'Specialization must not exceed 100 characters']
    },

    experience: {
      type: Number,
      min: [0, 'Experience cannot be negative'],
      max: [50, 'Experience cannot exceed 50 years']
    },

    // Profile
    teacher_image: {
      type: String,
      default: null
    },

    // Roles and Permissions
    roles: {
      type: [String],
      default: ['TEACHER'],
      validate: {
        validator: function(roles) {
          const validRoles = ['TEACHER', 'HEAD_TEACHER', 'DEPARTMENT_HEAD'];
          return roles.every(role => validRoles.includes(role));
        },
        message: 'Invalid role specified'
      }
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

    // Employment Information
    hireDate: {
      type: Date,
      default: Date.now
    },

    employmentType: {
      type: String,
      enum: {
        values: ['full-time', 'part-time', 'contract', 'temporary'],
        message: '{VALUE} is not a valid employment type'
      },
      default: 'full-time'
    },

    salary: {
      type: Number,
      min: [0, 'Salary cannot be negative'],
      select: false // Hidden by default for privacy
    },

    // Metadata
    lastLogin: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Indexes for performance
teacherSchema.index({ email: 1 });
teacherSchema.index({ username: 1 });
teacherSchema.index({ schoolCampus: 1 });
teacherSchema.index({ status: 1 });
teacherSchema.index({ firstName: 1, lastName: 1 });

// Virtual for full name
teacherSchema.virtual('fullName').get(function () {
  return `${this.firstName} ${this.lastName}`;
});

// Virtual for age (if dateOfBirth exists)
teacherSchema.virtual('age').get(function () {
  if (!this.dateOfBirth) return null;
  const today = new Date();
  const birthDate = new Date(this.dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
});

// Pre-save middleware to ensure lowercase
teacherSchema.pre('save', function (next) {
  if (this.email) {
    this.email = this.email.toLowerCase();
  }
  if (this.username) {
    this.username = this.username.toLowerCase();
  }
  next();
});

const Teacher = mongoose.model('Teacher', teacherSchema);

module.exports = Teacher;