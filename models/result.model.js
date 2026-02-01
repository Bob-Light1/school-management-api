const mongoose = require("mongoose");

/**
 * Result Schema
 * Represents student examination results with automatic grading
 * Multi-tenant isolated by campus (via student/class relationship)
 */
const resultSchema = new mongoose.Schema(
  {
    // ========================================
    // CORE REFERENCES
    // ========================================

    // Student who took the exam
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: [true, 'Student is required'],
      index: true,
    },

    // Examination reference
    exam: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Examination",
      required: [true, 'Exam is required'],
      index: true,
    },

    // Subject being examined
    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      required: [true, 'Subject is required'],
      index: true,
    },

    // Class of the student
    class: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Class",
      required: [true, 'Class is required'],
      index: true,
    },

    // Teacher who corrected the exam
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Teacher",
      required: [true, 'Teacher is required'],
      index: true,
    },

    // Campus (denormalized for easier queries)
    schoolCampus: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Campus",
      required: [true, 'Campus is required'],
      index: true,
    },

    // ========================================
    // SCORES & GRADES
    // ========================================

    // Score obtained by student
    score: {
      type: Number,
      required: [true, 'Score is required'],
      min: [0, 'Score cannot be negative']
    },

    // Maximum score for this exam (snapshot for data integrity)
    maxScore: {
      type: Number,
      required: [true, 'Max score is required'],
      default: 20,
      min: [1, 'Max score must be at least 1']
    },

    // Calculated percentage (auto-computed)
    percentage: {
      type: Number,
      min: 0,
      max: 100,
      index: true
    },

    // Letter grade (A, B, C, D, E, F) - auto-computed
    grade: {
      type: String,
      enum: ['A+', 'A', 'B+', 'B', 'C+', 'C', 'D', 'E', 'F']
    },

    // Academic mention based on percentage (auto-computed)
    mention: {
      type: String,
      enum: [
        "Excellent",      // 80-100%
        "Very Good",      // 70-79%
        "Good",           // 60-69%
        "Fairly Good",    // 50-59%
        "Passable",       // 40-49%
        "Insufficient"    // 0-39%
      ],
    },

    // Pass/fail status (auto-computed)
    status: {
      type: String,
      enum: ["pass", "fail"],
      index: true,
    },

    // ========================================
    // OBSERVATIONS & FEEDBACK
    // ========================================

    // Teacher's remarks/observations
    teacherRemarks: {
      type: String,
      maxlength: [1000, 'Teacher remarks must not exceed 1000 characters'],
      trim: true
    },

    // Class manager's observations (optional)
    classManagerRemarks: {
      type: String,
      maxlength: [1000, 'Class manager remarks must not exceed 1000 characters'],
      trim: true
    },

    // Class manager who added remarks
    classManager: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Teacher"
    },

    // Areas of strength (optional)
    strengths: {
      type: String,
      maxlength: [500, 'Strengths must not exceed 500 characters']
    },

    // Areas needing improvement (optional)
    improvements: {
      type: String,
      maxlength: [500, 'Improvements must not exceed 500 characters']
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

    // Exam period (e.g., "Midterm", "Final", "Quiz 1")
    examPeriod: {
      type: String,
      enum: ["Midterm", "Final", "Quiz", "Assignment", "Project", "Practical"],
      default: "Midterm"
    },

    // Week or month of the exam
    examWeek: {
      type: Number,
      min: 1,
      max: 52
    },

    examMonth: {
      type: String,
      enum: ["January", "February", "March", "April", "May", "June", 
             "July", "August", "September", "October", "November", "December"]
    },

    // ========================================
    // TIMESTAMPS & PUBLICATION
    // ========================================

    // When the exam was taken
    examDate: {
      type: Date,
      required: [true, 'Exam date is required']
    },

    // When the result was corrected
    correctedAt: {
      type: Date,
      default: Date.now
    },

    // Publication status
    isPublished: {
      type: Boolean,
      default: false,
      index: true,
    },

    // When the result was published to students
    publishedAt: {
      type: Date
    },

    // Who published the result
    publishedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Teacher"
    },

    // ========================================
    // METADATA
    // ========================================

    // Weight of this exam in final grade (percentage)
    weight: {
      type: Number,
      min: 0,
      max: 100,
      default: 100
    },

    // Attendance status during exam
    attendance: {
      type: String,
      enum: ["present", "absent", "excused"],
      default: "present"
    },

    // Special circumstances (e.g., medical excuse)
    specialCircumstances: {
      type: String,
      maxlength: [200, 'Special circumstances must not exceed 200 characters']
    }
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
 * Ensure a student has only one result per examination
 */
resultSchema.index({ student: 1, exam: 1 }, { unique: true });

/**
 * Campus-based queries
 */
resultSchema.index({ schoolCampus: 1, academicYear: 1, semester: 1 });

/**
 * Class performance queries
 */
resultSchema.index({ class: 1, subject: 1, academicYear: 1 });

/**
 * Student performance tracking
 */
resultSchema.index({ student: 1, academicYear: 1, semester: 1 });

/**
 * Published results queries
 */
resultSchema.index({ isPublished: 1, academicYear: 1, semester: 1 });

// ========================================
// VIRTUAL FIELDS
// ========================================

/**
 * Score out of 20 (normalized)
 */
resultSchema.virtual('scoreOutOf20').get(function() {
  return (this.score / this.maxScore) * 20;
});

/**
 * Points earned (for weighted average)
 */
resultSchema.virtual('weightedScore').get(function() {
  return (this.percentage * this.weight) / 100;
});

// ========================================
// PRE-SAVE MIDDLEWARE
// ========================================

/**
 * Automatically compute percentage, status, grade, and mention before saving
 */
resultSchema.pre("save", function (next) {
  try {
    // 1. Calculate percentage
    if (this.score !== undefined && this.maxScore) {
      this.percentage = Math.round((this.score / this.maxScore) * 100 * 100) / 100; // 2 decimal places
    }

    // 2. Determine pass or fail (50% is passing)
    this.status = this.percentage >= 50 ? "pass" : "fail";

    // 3. Assign letter grade
    if (this.percentage >= 95) this.grade = "A+";
    else if (this.percentage >= 90) this.grade = "A";
    else if (this.percentage >= 85) this.grade = "B+";
    else if (this.percentage >= 80) this.grade = "B";
    else if (this.percentage >= 75) this.grade = "C+";
    else if (this.percentage >= 70) this.grade = "C";
    else if (this.percentage >= 60) this.grade = "D";
    else if (this.percentage >= 50) this.grade = "E";
    else this.grade = "F";

    // 4. Determine academic mention
    if (this.percentage >= 80) this.mention = "Excellent";
    else if (this.percentage >= 70) this.mention = "Very Good";
    else if (this.percentage >= 60) this.mention = "Good";
    else if (this.percentage >= 50) this.mention = "Fairly Good";
    else if (this.percentage >= 40) this.mention = "Passable";
    else this.mention = "Insufficient";

    next();
  } catch (error) {
    next(error);
  }
});

// ========================================
// INSTANCE METHODS
// ========================================

/**
 * Publish the result
 */
resultSchema.methods.publish = async function(publishedBy) {
  this.isPublished = true;
  this.publishedAt = new Date();
  this.publishedBy = publishedBy;
  await this.save();
  return this;
};

/**
 * Unpublish the result
 */
resultSchema.methods.unpublish = async function() {
  this.isPublished = false;
  this.publishedAt = null;
  await this.save();
  return this;
};

/**
 * Add class manager remarks
 */
resultSchema.methods.addClassManagerRemarks = async function(remarks, managerId) {
  this.classManagerRemarks = remarks;
  this.classManager = managerId;
  await this.save();
  return this;
};

/**
 * Get color code based on score
 */
resultSchema.methods.getScoreColor = function() {
  const score = this.scoreOutOf20;
  if (score < 10) return '#ef4444'; // Red
  if (score < 15) return '#3b82f6'; // Blue
  return '#10b981'; // Green
};

// ========================================
// STATIC METHODS
// ========================================

/**
 * Calculate class average for a subject
 */
resultSchema.statics.calculateClassAverage = async function(classId, subjectId, academicYear, semester) {
  const results = await this.aggregate([
    {
      $match: {
        class: mongoose.Types.ObjectId(classId),
        subject: mongoose.Types.ObjectId(subjectId),
        academicYear,
        semester,
        attendance: 'present' // Only count present students
      }
    },
    {
      $group: {
        _id: null,
        averageScore: { $avg: '$score' },
        averagePercentage: { $avg: '$percentage' },
        totalStudents: { $sum: 1 },
        passCount: {
          $sum: { $cond: [{ $eq: ['$status', 'pass'] }, 1, 0] }
        }
      }
    }
  ]);

  return results[0] || {
    averageScore: 0,
    averagePercentage: 0,
    totalStudents: 0,
    passCount: 0
  };
};

/**
 * Calculate student's overall average
 */
resultSchema.statics.calculateStudentAverage = async function(studentId, academicYear, semester) {
  const results = await this.aggregate([
    {
      $match: {
        student: mongoose.Types.ObjectId(studentId),
        academicYear,
        semester,
        isPublished: true,
        attendance: 'present'
      }
    },
    {
      $lookup: {
        from: 'subjects',
        localField: 'subject',
        foreignField: '_id',
        as: 'subjectInfo'
      }
    },
    {
      $unwind: '$subjectInfo'
    },
    {
      $group: {
        _id: null,
        weightedSum: {
          $sum: {
            $multiply: ['$percentage', '$subjectInfo.coefficient']
          }
        },
        totalCoefficients: { $sum: '$subjectInfo.coefficient' },
        subjectCount: { $sum: 1 }
      }
    }
  ]);

  if (!results[0] || results[0].totalCoefficients === 0) {
    return { average: 0, subjectCount: 0 };
  }

  return {
    average: Math.round((results[0].weightedSum / results[0].totalCoefficients) * 100) / 100,
    subjectCount: results[0].subjectCount
  };
};

/**
 * Get top performers in a class
 */
resultSchema.statics.getTopPerformers = async function(classId, subjectId, academicYear, semester, limit = 10) {
  return this.find({
    class: classId,
    subject: subjectId,
    academicYear,
    semester,
    isPublished: true
  })
    .populate('student', 'firstName lastName')
    .sort({ percentage: -1 })
    .limit(limit);
};

/**
 * Get results by performance range
 */
resultSchema.statics.getResultsByRange = async function(filters, ranges) {
  const { classId, subjectId, academicYear, semester } = filters;
  
  return this.aggregate([
    {
      $match: {
        class: mongoose.Types.ObjectId(classId),
        ...(subjectId && { subject: mongoose.Types.ObjectId(subjectId) }),
        academicYear,
        semester,
        isPublished: true
      }
    },
    {
      $bucket: {
        groupBy: '$percentage',
        boundaries: ranges || [0, 40, 50, 60, 70, 80, 100],
        default: 'Other',
        output: {
          count: { $sum: 1 },
          students: { $push: '$student' }
        }
      }
    }
  ]);
};

const Result = mongoose.model("Result", resultSchema);

module.exports = Result;