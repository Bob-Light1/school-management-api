const mongoose = require('mongoose');

/**
 * Student Attendance Schema
 * Tracks student presence for each scheduled session
 * Multi-tenant isolated by campus
 */
const studentAttendanceSchema = new mongoose.Schema(
  {
    // ========================================
    // CORE REFERENCES
    // ========================================

    // Student reference
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: [true, 'Student is required'],
      index: true,
    },

    // Schedule session reference (the class session)
    schedule: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Schedule',
      required: [true, 'Schedule is required'],
      index: true,
    },

    // Class reference (denormalized for faster queries)
    class: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
      required: [true, 'Class is required'],
      index: true,
    },

    // Campus reference (denormalized for campus isolation)
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

    // Teacher who recorded attendance
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Teacher',
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

    // Date of the session (YYYY-MM-DD format for easy queries)
    attendanceDate: {
      type: Date,
      required: [true, 'Attendance date is required'],
      index: true,
    },

    // Session time (for reference)
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

    // Week and month for statistical queries
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
    // LOCKING MECHANISM (After end of day)
    // ========================================

    // Is this attendance record locked? (cannot modify status after day ends)
    isLocked: {
      type: Boolean,
      default: false,
      index: true,
    },

    // When was it locked
    lockedAt: {
      type: Date,
    },

    // Who locked it (system or admin)
    lockedBy: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'lockedByModel',
    },

    lockedByModel: {
      type: String,
      enum: ['Teacher', 'Campus', 'System'],
    },

    // ========================================
    // JUSTIFICATION (For absences)
    // ========================================

    // Justified absence reason
    justification: {
      type: String,
      maxlength: [500, 'Justification must not exceed 500 characters'],
      trim: true,
    },

    // Supporting document (medical certificate, etc.)
    justificationDocument: {
      type: String, // File path or URL
    },

    // Is the absence justified/excused
    isJustified: {
      type: Boolean,
      default: false,
    },

    // Who added justification
    justifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Teacher',
    },

    // When was justification added
    justifiedAt: {
      type: Date,
    },

    // ========================================
    // METADATA
    // ========================================

    // Remarks by teacher
    remarks: {
      type: String,
      maxlength: [500, 'Remarks must not exceed 500 characters'],
      trim: true,
    },

    // Was attendance taken late?
    isLate: {
      type: Boolean,
      default: false,
    },

    // Recording timestamp
    recordedAt: {
      type: Date,
      default: Date.now,
    },

    // Last modification (before locking)
    lastModifiedAt: {
      type: Date,
    },

    lastModifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Teacher',
    },
  },
  {
    timestamps: true, // createdAt & updatedAt
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ========================================
// INDEXES FOR PERFORMANCE
// ========================================

/**
 * Compound index: Prevent duplicate attendance records
 * One record per student per schedule session
 */
studentAttendanceSchema.index(
  { student: 1, schedule: 1, attendanceDate: 1 },
  { unique: true }
);

/**
 * Queries for campus statistics
 */
studentAttendanceSchema.index({
  schoolCampus: 1,
  attendanceDate: 1,
  status: 1,
});

/**
 * Queries for class attendance
 */
studentAttendanceSchema.index({
  class: 1,
  attendanceDate: 1,
  academicYear: 1,
  semester: 1,
});

/**
 * Queries for student attendance history
 */
studentAttendanceSchema.index({
  student: 1,
  academicYear: 1,
  semester: 1,
  status: 1,
});

/**
 * Queries for weekly/monthly reports
 */
studentAttendanceSchema.index({
  schoolCampus: 1,
  year: 1,
  month: 1,
  weekNumber: 1,
});

// ========================================
// PRE-SAVE MIDDLEWARE
// ========================================

/**
 * Auto-calculate week, month, year from attendanceDate
 * Prevent modification of locked records
 */
studentAttendanceSchema.pre('save', function(next) {
  try {
    // Extract week, month, year from attendanceDate
    if (this.attendanceDate) {
      const date = new Date(this.attendanceDate);
      this.month = date.getMonth() + 1; // 1-12
      this.year = date.getFullYear();
      
      // Calculate week number
      const oneJan = new Date(date.getFullYear(), 0, 1);
      const numberOfDays = Math.floor((date - oneJan) / (24 * 60 * 60 * 1000));
      this.weekNumber = Math.ceil((numberOfDays + oneJan.getDay() + 1) / 7);
    }

    // Prevent modification of locked records (except justification)
    if (!this.isNew && this.isLocked && this.isModified('status')) {
      return next(new Error('Cannot modify locked attendance record. Add justification instead.'));
    }

    // Track last modification
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

/**
 * Lock attendance record (cannot modify status after this)
 */
studentAttendanceSchema.methods.lock = async function(lockedBy, lockedByModel = 'System') {
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

/**
 * Add justification for absence
 */
studentAttendanceSchema.methods.addJustification = async function(
  justification,
  justifiedBy,
  document = null
) {
  if (this.status === true) {
    throw new Error('Cannot justify absence for present student');
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

/**
 * Toggle attendance status (with confirmation for unchecking)
 */
studentAttendanceSchema.methods.toggleStatus = async function(newStatus, userId) {
  if (this.isLocked) {
    throw new Error('Cannot modify locked attendance. Add justification instead.');
  }

  this.status = newStatus;
  this.lastModifiedBy = userId;
  this.lastModifiedAt = new Date();

  // If marking as absent, clear justification
  if (newStatus === false) {
    this.isJustified = false;
    this.justification = null;
    this.justificationDocument = null;
  }

  await this.save();
  return this;
};

// ========================================
// STATIC METHODS
// ========================================

/**
 * Lock all attendance records for a specific date
 * Called automatically at end of day
 */
studentAttendanceSchema.statics.lockDailyAttendance = async function(date, campusId = null) {
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

/**
 * Calculate attendance statistics for a student
 */
studentAttendanceSchema.statics.getStudentStats = async function(
  studentId,
  academicYear,
  semester,
  period = 'all' // 'all', 'month', 'week'
) {
  const matchStage = {
    student: mongoose.Types.ObjectId(studentId),
    academicYear,
    semester,
  };

  // Add period filter
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
        presentCount: {
          $sum: { $cond: [{ $eq: ['$status', true] }, 1, 0] },
        },
        absentCount: {
          $sum: { $cond: [{ $eq: ['$status', false] }, 1, 0] },
        },
        justifiedAbsences: {
          $sum: { $cond: ['$isJustified', 1, 0] },
        },
      },
    },
    {
      $project: {
        _id: 0,
        totalSessions: 1,
        presentCount: 1,
        absentCount: 1,
        justifiedAbsences: 1,
        unjustifiedAbsences: {
          $subtract: ['$absentCount', '$justifiedAbsences'],
        },
        attendanceRate: {
          $multiply: [
            { $divide: ['$presentCount', '$totalSessions'] },
            100,
          ],
        },
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
  };
};

/**
 * Calculate attendance statistics for a class
 */
studentAttendanceSchema.statics.getClassStats = async function(
  classId,
  date = null,
  period = 'day' // 'day', 'week', 'month', 'year'
) {
  const matchStage = { class: mongoose.Types.ObjectId(classId) };

  if (date) {
    const targetDate = new Date(date);
    
    if (period === 'day') {
      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);
      matchStage.attendanceDate = { $gte: startOfDay, $lte: endOfDay };
    } else if (period === 'week') {
      matchStage.weekNumber = targetDate.getWeekNumber();
      matchStage.year = targetDate.getFullYear();
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
        _id: '$student',
        totalSessions: { $sum: 1 },
        presentCount: { $sum: { $cond: ['$status', 1, 0] } },
        absentCount: { $sum: { $cond: [{ $not: '$status' }, 1, 0] } },
      },
    },
    {
      $group: {
        _id: null,
        totalStudents: { $sum: 1 },
        avgAttendanceRate: {
          $avg: {
            $multiply: [{ $divide: ['$presentCount', '$totalSessions'] }, 100],
          },
        },
        totalSessions: { $avg: '$totalSessions' },
      },
    },
  ]);

  return stats[0] || { totalStudents: 0, avgAttendanceRate: 0, totalSessions: 0 };
};

/**
 * Get attendance for today's schedule
 */
studentAttendanceSchema.statics.getTodayAttendance = async function(
  scheduleId,
  classId,
  date = new Date()
) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  return this.find({
    schedule: scheduleId,
    class: classId,
    attendanceDate: { $gte: startOfDay, $lte: endOfDay },
  })
    .populate('student', 'firstName lastName email profileImage')
    .sort({ 'student.lastName': 1 });
};

// Helper for week number calculation
Date.prototype.getWeekNumber = function() {
  const oneJan = new Date(this.getFullYear(), 0, 1);
  const numberOfDays = Math.floor((this - oneJan) / (24 * 60 * 60 * 1000));
  return Math.ceil((numberOfDays + oneJan.getDay() + 1) / 7);
};

const StudentAttendance = mongoose.model('StudentAttendance', studentAttendanceSchema);

module.exports = StudentAttendance;