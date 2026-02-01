const mongoose = require("mongoose");

/**
 * Schedule Schema
 * Represents a timetable entry for a class, teacher, or student
 * Multi-tenant isolated by campus
 */
const scheduleSchema = new mongoose.Schema(
  {
    // ========================================
    // CORE REFERENCES
    // ========================================

    // Campus where the schedule applies
    schoolCampus: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Campus",
      required: [true, 'Campus is required'],
      index: true,
    },

    // Class concerned by the schedule
    class: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Class",
      required: [true, 'Class is required'],
      index: true,
    },

    // Subject being taught
    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      required: [true, 'Subject is required'],
      index: true,
    },

    // Teacher assigned to the session
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Teacher",
      required: [true, 'Teacher is required'],
      index: true,
    },

    // ========================================
    // TIME SCHEDULING
    // ========================================

    // Day of the week
    dayOfWeek: {
      type: String,
      enum: {
        values: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
        message: '{VALUE} is not a valid day'
      },
      required: [true, 'Day of week is required'],
      index: true,
    },

    // Start time of the session (HH:mm format, e.g., "08:00")
    startTime: {
      type: String,
      required: [true, 'Start time is required'],
      validate: {
        validator: function(v) {
          return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
        },
        message: 'Start time must be in HH:mm format (e.g., 08:00)'
      }
    },

    // End time of the session (HH:mm format)
    endTime: {
      type: String,
      required: [true, 'End time is required'],
      validate: {
        validator: function(v) {
          return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
        },
        message: 'End time must be in HH:mm format (e.g., 10:00)'
      }
    },

    // ========================================
    // LOCATION & LOGISTICS
    // ========================================

    // Classroom or room number (e.g., "Room 101", "Lab A")
    room: {
      type: String,
      trim: true,
      maxlength: [50, 'Room name must not exceed 50 characters']
    },

    // Building (optional)
    building: {
      type: String,
      trim: true,
      maxlength: [50, 'Building name must not exceed 50 characters']
    },

    // ========================================
    // ACADEMIC PERIOD
    // ========================================

    // Academic year (e.g., "2024-2025")
    academicYear: {
      type: String,
      required: [true, 'Academic year is required'],
      index: true,
      validate: {
        validator: function(v) {
          return /^\d{4}-\d{4}$/.test(v);
        },
        message: 'Academic year must be in format YYYY-YYYY (e.g., 2024-2025)'
      }
    },

    // Semester
    semester: {
      type: String,
      enum: {
        values: ["S1", "S2", "Annual"],
        message: '{VALUE} is not a valid semester'
      },
      required: [true, 'Semester is required'],
      index: true,
    },

    // Week number in semester (1-20 typically)
    weekNumber: {
      type: Number,
      min: [1, 'Week number must be at least 1'],
      max: [52, 'Week number cannot exceed 52']
    },

    // ========================================
    // STATUS & METADATA
    // ========================================

    // Schedule status
    status: {
      type: String,
      enum: {
        values: ["active", "cancelled", "rescheduled", "completed"],
        message: '{VALUE} is not a valid status'
      },
      default: "active",
      index: true,
    },

    // Session type
    sessionType: {
      type: String,
      enum: {
        values: ["lecture", "tutorial", "lab", "exam", "seminar", "workshop"],
        message: '{VALUE} is not a valid session type'
      },
      default: "lecture"
    },

    // Notes or special instructions
    notes: {
      type: String,
      maxlength: [500, 'Notes must not exceed 500 characters']
    },

    // Color for UI display (hex format)
    color: {
      type: String,
      default: '#1976d2',
      validate: {
        validator: function(v) {
          return !v || /^#[0-9A-Fa-f]{6}$/.test(v);
        },
        message: 'Color must be in hex format (e.g., #FF5733)'
      }
    },

    // Cancellation reason (if status is cancelled)
    cancellationReason: {
      type: String,
      maxlength: [200, 'Cancellation reason must not exceed 200 characters']
    },

    // Cancelled by (user reference)
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'cancelledByModel'
    },

    cancelledByModel: {
      type: String,
      enum: ['Teacher', 'Campus', 'Admin']
    },

    // Cancellation date
    cancelledAt: {
      type: Date
    }
  },
  {
    timestamps: true, // createdAt & updatedAt
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// ========================================
// INDEXES FOR PERFORMANCE
// ========================================

/**
 * Prevent duplicate schedules for the same class, day, and time slot
 */
scheduleSchema.index(
  {
    class: 1,
    dayOfWeek: 1,
    startTime: 1,
    endTime: 1,
    academicYear: 1,
    semester: 1,
    status: 1
  },
  { 
    unique: true,
    partialFilterExpression: { status: 'active' } // Only active schedules must be unique
  }
);

/**
 * Efficient queries by teacher and day
 */
scheduleSchema.index({ teacher: 1, dayOfWeek: 1, academicYear: 1 });

/**
 * Campus isolation queries
 */
scheduleSchema.index({ schoolCampus: 1, status: 1 });

/**
 * Student schedule queries (via class)
 */
scheduleSchema.index({ class: 1, academicYear: 1, semester: 1 });

// ========================================
// VIRTUAL FIELDS
// ========================================

/**
 * Calculate duration in minutes
 */
scheduleSchema.virtual('durationMinutes').get(function() {
  if (!this.startTime || !this.endTime) return 0;
  
  const [startHour, startMin] = this.startTime.split(':').map(Number);
  const [endHour, endMin] = this.endTime.split(':').map(Number);
  
  const startTotal = startHour * 60 + startMin;
  const endTotal = endHour * 60 + endMin;
  
  return endTotal - startTotal;
});

/**
 * Format time range for display
 */
scheduleSchema.virtual('timeRange').get(function() {
  return `${this.startTime} - ${this.endTime}`;
});

/**
 * Full location string
 */
scheduleSchema.virtual('fullLocation').get(function() {
  if (this.building && this.room) {
    return `${this.building} - ${this.room}`;
  }
  return this.room || 'TBA';
});

// ========================================
// PRE-SAVE MIDDLEWARE
// ========================================

/**
 * Validate time logic and cross-campus relationships
 */
scheduleSchema.pre('save', async function(next) {
  try {
    // 1. Validate startTime < endTime
    if (this.startTime >= this.endTime) {
      throw new Error('Start time must be before end time');
    }

    // 2. Validate duration (minimum 15 minutes, maximum 4 hours)
    const duration = this.durationMinutes;
    if (duration < 15) {
      throw new Error('Session duration must be at least 15 minutes');
    }
    if (duration > 240) {
      throw new Error('Session duration cannot exceed 4 hours');
    }

    // 3. Cross-campus validation (only when creating or modifying references)
    if (this.isNew || this.isModified('teacher') || this.isModified('class') || this.isModified('subject')) {
      const Teacher = mongoose.model('Teacher');
      const Class = mongoose.model('Class');
      const Subject = mongoose.model('Subject');

      // Validate teacher belongs to same campus
      if (this.teacher && this.schoolCampus) {
        const teacher = await Teacher.findById(this.teacher).select('schoolCampus');
        if (teacher && teacher.schoolCampus.toString() !== this.schoolCampus.toString()) {
          throw new Error('Teacher must belong to the same campus');
        }
      }

      // Validate class belongs to same campus
      if (this.class && this.schoolCampus) {
        const classDoc = await Class.findById(this.class).select('schoolCampus');
        if (classDoc && classDoc.schoolCampus.toString() !== this.schoolCampus.toString()) {
          throw new Error('Class must belong to the same campus');
        }
      }

      // Validate subject belongs to same campus
      if (this.subject && this.schoolCampus) {
        const subject = await Subject.findById(this.subject).select('schoolCampus');
        if (subject && subject.schoolCampus.toString() !== this.schoolCampus.toString()) {
          throw new Error('Subject must belong to the same campus');
        }
      }
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
 * Cancel a schedule session
 */
scheduleSchema.methods.cancel = async function(reason, cancelledBy, cancelledByModel) {
  this.status = 'cancelled';
  this.cancellationReason = reason;
  this.cancelledBy = cancelledBy;
  this.cancelledByModel = cancelledByModel;
  this.cancelledAt = new Date();
  await this.save();
  return this;
};

/**
 * Check if schedule conflicts with another time slot
 */
scheduleSchema.methods.hasTimeConflict = function(otherStartTime, otherEndTime) {
  // Convert times to minutes for comparison
  const toMinutes = (time) => {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  };

  const start1 = toMinutes(this.startTime);
  const end1 = toMinutes(this.endTime);
  const start2 = toMinutes(otherStartTime);
  const end2 = toMinutes(otherEndTime);

  // Check for overlap
  return (start1 < end2 && end1 > start2);
};

// ========================================
// STATIC METHODS
// ========================================

/**
 * Get schedule for a specific class
 */
scheduleSchema.statics.getClassSchedule = function(classId, academicYear, semester) {
  return this.find({
    class: classId,
    academicYear,
    semester,
    status: 'active'
  })
    .populate('subject', 'subject_name subject_code color')
    .populate('teacher', 'firstName lastName email')
    .sort({ dayOfWeek: 1, startTime: 1 });
};

/**
 * Get schedule for a specific teacher
 */
scheduleSchema.statics.getTeacherSchedule = function(teacherId, academicYear, semester) {
  return this.find({
    teacher: teacherId,
    academicYear,
    semester,
    status: 'active'
  })
    .populate('class', 'className')
    .populate('subject', 'subject_name subject_code color')
    .sort({ dayOfWeek: 1, startTime: 1 });
};

/**
 * Get schedule for a specific campus
 */
scheduleSchema.statics.getCampusSchedule = function(campusId, academicYear, semester) {
  return this.find({
    schoolCampus: campusId,
    academicYear,
    semester,
    status: 'active'
  })
    .populate('class', 'className')
    .populate('subject', 'subject_name subject_code color')
    .populate('teacher', 'firstName lastName')
    .sort({ dayOfWeek: 1, startTime: 1 });
};

/**
 * Check for scheduling conflicts
 */
scheduleSchema.statics.checkConflicts = async function(scheduleData) {
  const conflicts = await this.find({
    $or: [
      { teacher: scheduleData.teacher },
      { class: scheduleData.class },
      { room: scheduleData.room }
    ],
    dayOfWeek: scheduleData.dayOfWeek,
    academicYear: scheduleData.academicYear,
    semester: scheduleData.semester,
    status: 'active',
    _id: { $ne: scheduleData._id } // Exclude self when updating
  });

  return conflicts.filter(conflict => {
    const schedule = new this(scheduleData);
    return schedule.hasTimeConflict(conflict.startTime, conflict.endTime);
  });
};

const Schedule = mongoose.model("Schedule", scheduleSchema);

module.exports = Schedule;