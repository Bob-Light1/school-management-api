const mongoose = require('mongoose');

/**
 * Teacher Attendance Schema
 * Tracks teacher presence for each scheduled session
 * Only CAMPUS_MANAGER can record teacher attendance
 */
const teacherAttendanceSchema = new mongoose.Schema(
  {
    // ========================================
    // CORE REFERENCES
    // ========================================

    // Teacher reference
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Teacher',
      required: [true, 'Teacher is required'],
      index: true,
    },

    // Schedule session reference (the teaching session)
    schedule: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Schedule',
      required: [true, 'Schedule is required'],
      index: true,
    },

    // Campus reference (for isolation)
    schoolCampus: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Campus',
      required: [true, 'Campus is required'],
      index: true,
    },

    // Subject reference (denormalized)
    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subject',
      required: [true, 'Subject is required'],
    },

    // Class reference (denormalized)
    class: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
      required: [true, 'Class is required'],
    },

    // Campus Manager who recorded attendance
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Teacher', // Campus Manager is also a Teacher role
      required: [true, 'Recorder is required'],
    },

    // ========================================
    // ATTENDANCE STATUS
    // ========================================

    // Attendance status: false = absent (default), true = present
    status: {
      type: Boolean,
      default: false, // Default is ABSENT (unchecked)
      index: true,
    },

    // ========================================
    // DATE & TIME TRACKING
    // ========================================

    // Date of the session
    attendanceDate: {
      type: Date,
      required: [true, 'Attendance date is required'],
      index: true,
    },

    // Session time
    sessionStartTime: {
      type: String, // HH:mm
    },

    sessionEndTime: {
      type: String, // HH:mm
    },

    // Academic period
    academicYear: {
      type: String,
      required: [true, 'Academic year is required'],
      index: true,
      validate: {
        validator: function(v) {
          return /^\d{4}-\d{4}$/.test(v);
        },
        message: 'Academic year must be in format YYYY-YYYY',
      },
    },

    semester: {
      type: String,
      required: [true, 'Semester is required'],
      enum: ['S1', 'S2', 'Annual'],
      index: true,
    },

    // Statistical tracking
    weekNumber: {
      type: Number,
      min: 1,
      max: 52,
      index: true,
    },

    month: {
      type: Number,
      min: 1,
      max: 12,
      index: true,
    },

    year: {
      type: Number,
      index: true,
    },

    // ========================================
    // LOCKING MECHANISM
    // ========================================

    isLocked: {
      type: Boolean,
      default: false,
      index: true,
    },

    lockedAt: {
      type: Date,
    },

    lockedBy: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'lockedByModel',
    },

    lockedByModel: {
      type: String,
      enum: ['Teacher', 'Campus', 'System'],
    },

    // ========================================
    // JUSTIFICATION
    // ========================================

    justification: {
      type: String,
      maxlength: [500, 'Justification must not exceed 500 characters'],
      trim: true,
    },

    justificationDocument: {
      type: String,
    },

    isJustified: {
      type: Boolean,
      default: false,
    },

    justifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Teacher',
    },

    justifiedAt: {
      type: Date,
    },

    // ========================================
    // PAYROLL TRACKING
    // ========================================

    // Session duration (for payroll calculation)
    sessionDuration: {
      type: Number, // in minutes
    },

    // Was this session paid?
    isPaid: {
      type: Boolean,
      default: false,
      index: true,
    },

    // Payment reference
    paymentRef: {
      type: String,
    },

    paidAt: {
      type: Date,
    },

    // ========================================
    // REPLACEMENT TEACHER
    // ========================================

    // If teacher was absent, was there a replacement?
    hasReplacement: {
      type: Boolean,
      default: false,
    },

    replacementTeacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Teacher',
    },

    replacementNotes: {
      type: String,
      maxlength: [300, 'Replacement notes must not exceed 300 characters'],
    },

    // ========================================
    // METADATA
    // ========================================

    remarks: {
      type: String,
      maxlength: [500, 'Remarks must not exceed 500 characters'],
      trim: true,
    },

    isLate: {
      type: Boolean,
      default: false,
    },

    // Arrival time (if late)
    arrivalTime: {
      type: String, // HH:mm
    },

    recordedAt: {
      type: Date,
      default: Date.now,
    },

    lastModifiedAt: {
      type: Date,
    },

    lastModifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Teacher',
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ========================================
// INDEXES
// ========================================

teacherAttendanceSchema.index(
  { teacher: 1, schedule: 1, attendanceDate: 1 },
  { unique: true }
);

teacherAttendanceSchema.index({
  schoolCampus: 1,
  attendanceDate: 1,
  status: 1,
});

teacherAttendanceSchema.index({
  teacher: 1,
  academicYear: 1,
  semester: 1,
  status: 1,
});

teacherAttendanceSchema.index({
  schoolCampus: 1,
  year: 1,
  month: 1,
  isPaid: 1,
});

// ========================================
// PRE-SAVE MIDDLEWARE
// ========================================

teacherAttendanceSchema.pre('save', function(next) {
  try {
    // Calculate week, month, year
    if (this.attendanceDate) {
      const date = new Date(this.attendanceDate);
      this.month = date.getMonth() + 1;
      this.year = date.getFullYear();
      
      const oneJan = new Date(date.getFullYear(), 0, 1);
      const numberOfDays = Math.floor((date - oneJan) / (24 * 60 * 60 * 1000));
      this.weekNumber = Math.ceil((numberOfDays + oneJan.getDay() + 1) / 7);
    }

    // Calculate session duration from times
    if (this.sessionStartTime && this.sessionEndTime) {
      const start = this.sessionStartTime.split(':').map(Number);
      const end = this.sessionEndTime.split(':').map(Number);
      
      const startMinutes = start[0] * 60 + start[1];
      const endMinutes = end[0] * 60 + end[1];
      
      this.sessionDuration = endMinutes - startMinutes;
    }

    // Prevent modification of locked records
    if (!this.isNew && this.isLocked && this.isModified('status')) {
      return next(new Error('Cannot modify locked attendance. Add justification instead.'));
    }

    if (this.isModified('status') || this.isModified('justification')) {
      this.lastModifiedAt = new Date();
    }

    next();
  } catch (error) {
    next(error);
  }
});

// ========================================
// INSTANCE METHODS
// ========================================

teacherAttendanceSchema.methods.lock = async function(lockedBy, lockedByModel = 'System') {
  if (this.isLocked) {
    throw new Error('Attendance record is already locked');
  }

  this.isLocked = true;
  this.lockedAt = new Date();
  this.lockedBy = lockedBy;
  this.lockedByModel = lockedByModel;
  
  await this.save();
  return this;
};

teacherAttendanceSchema.methods.addJustification = async function(
  justification,
  justifiedBy,
  document = null
) {
  if (this.status === true) {
    throw new Error('Cannot justify absence for present teacher');
  }

  this.justification = justification;
  this.justifiedBy = justifiedBy;
  this.justifiedAt = new Date();
  this.isJustified = true;
  
  if (document) {
    this.justificationDocument = document;
  }

  await this.save();
  return this;
};

teacherAttendanceSchema.methods.toggleStatus = async function(newStatus, userId) {
  if (this.isLocked) {
    throw new Error('Cannot modify locked attendance. Add justification instead.');
  }

  this.status = newStatus;
  this.lastModifiedBy = userId;
  this.lastModifiedAt = new Date();

  if (newStatus === false) {
    this.isJustified = false;
    this.justification = null;
    this.justificationDocument = null;
  }

  await this.save();
  return this;
};

teacherAttendanceSchema.methods.markAsPaid = async function(paymentRef) {
  if (!this.status) {
    throw new Error('Cannot pay for absent teacher');
  }

  this.isPaid = true;
  this.paymentRef = paymentRef;
  this.paidAt = new Date();
  
  await this.save();
  return this;
};

// ========================================
// STATIC METHODS
// ========================================

teacherAttendanceSchema.statics.lockDailyAttendance = async function(date, campusId = null) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const filter = {
    attendanceDate: { $gte: startOfDay, $lte: endOfDay },
    isLocked: false,
  };

  if (campusId) {
    filter.schoolCampus = campusId;
  }

  const result = await this.updateMany(filter, {
    $set: {
      isLocked: true,
      lockedAt: new Date(),
      lockedByModel: 'System',
    },
  });

  return result;
};

teacherAttendanceSchema.statics.getTeacherStats = async function(
  teacherId,
  academicYear,
  semester,
  period = 'all'
) {
  const matchStage = {
    teacher: mongoose.Types.ObjectId(teacherId),
    academicYear,
    semester,
  };

  if (period === 'month') {
    const now = new Date();
    matchStage.month = now.getMonth() + 1;
    matchStage.year = now.getFullYear();
  } else if (period === 'week') {
    const now = new Date();
    const oneJan = new Date(now.getFullYear(), 0, 1);
    const numberOfDays = Math.floor((now - oneJan) / (24 * 60 * 60 * 1000));
    const currentWeek = Math.ceil((numberOfDays + oneJan.getDay() + 1) / 7);
    
    matchStage.weekNumber = currentWeek;
    matchStage.year = now.getFullYear();
  }

  const stats = await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalSessions: { $sum: 1 },
        presentCount: { $sum: { $cond: ['$status', 1, 0] } },
        absentCount: { $sum: { $cond: [{ $not: '$status' }, 1, 0] } },
        justifiedAbsences: { $sum: { $cond: ['$isJustified', 1, 0] } },
        totalMinutes: { $sum: '$sessionDuration' },
        paidSessions: { $sum: { $cond: ['$isPaid', 1, 0] } },
      },
    },
    {
      $project: {
        _id: 0,
        totalSessions: 1,
        presentCount: 1,
        absentCount: 1,
        justifiedAbsences: 1,
        unjustifiedAbsences: { $subtract: ['$absentCount', '$justifiedAbsences'] },
        attendanceRate: {
          $multiply: [{ $divide: ['$presentCount', '$totalSessions'] }, 100],
        },
        totalHours: { $divide: ['$totalMinutes', 60] },
        paidSessions: 1,
        unpaidSessions: { $subtract: ['$presentCount', '$paidSessions'] },
      },
    },
  ]);

  return stats[0] || {
    totalSessions: 0,
    presentCount: 0,
    absentCount: 0,
    justifiedAbsences: 0,
    unjustifiedAbsences: 0,
    attendanceRate: 0,
    totalHours: 0,
    paidSessions: 0,
    unpaidSessions: 0,
  };
};

teacherAttendanceSchema.statics.getCampusStats = async function(
  campusId,
  date = null,
  period = 'day'
) {
  const matchStage = { schoolCampus: mongoose.Types.ObjectId(campusId) };

  if (date) {
    const targetDate = new Date(date);
    
    if (period === 'day') {
      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);
      matchStage.attendanceDate = { $gte: startOfDay, $lte: endOfDay };
    } else if (period === 'month') {
      matchStage.month = targetDate.getMonth() + 1;
      matchStage.year = targetDate.getFullYear();
    } else if (period === 'year') {
      matchStage.year = targetDate.getFullYear();
    }
  }

  const stats = await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalTeachers: { $addToSet: '$teacher' },
        totalSessions: { $sum: 1 },
        presentSessions: { $sum: { $cond: ['$status', 1, 0] } },
        absentSessions: { $sum: { $cond: [{ $not: '$status' }, 1, 0] } },
      },
    },
    {
      $project: {
        _id: 0,
        totalTeachers: { $size: '$totalTeachers' },
        totalSessions: 1,
        presentSessions: 1,
        absentSessions: 1,
        attendanceRate: {
          $multiply: [{ $divide: ['$presentSessions', '$totalSessions'] }, 100],
        },
      },
    },
  ]);

  return stats[0] || {
    totalTeachers: 0,
    totalSessions: 0,
    presentSessions: 0,
    absentSessions: 0,
    attendanceRate: 0,
  };
};

teacherAttendanceSchema.statics.getTodayAttendance = async function(
  campusId,
  date = new Date()
) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  return this.find({
    schoolCampus: campusId,
    attendanceDate: { $gte: startOfDay, $lte: endOfDay },
  })
    .populate('teacher', 'firstName lastName email profileImage')
    .populate('schedule', 'startTime endTime')
    .populate('class', 'className')
    .sort({ sessionStartTime: 1 });
};

const TeacherAttendance = mongoose.model('TeacherAttendance', teacherAttendanceSchema);

module.exports = TeacherAttendance;