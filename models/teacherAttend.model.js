const mongoose = require("mongoose");

/**
 * TeacherAttendance Schema
 * Represents the daily attendance of a teacher.
 */
const teacherAttendanceSchema = new mongoose.Schema(
  {
    // Campus where the attendance is recorded
    schoolCampus: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SchoolCampus",
      required: true,
      index: true,
    },

    // Teacher concerned
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Teacher",
      required: true,
      index: true,
    },

    // Academic year (e.g. 2024-2025)
    academicYear: {
      type: String,
      required: true,
      index: true,
    },

    // Attendance date
    date: {
      type: Date,
      required: true,
      index: true,
    },

    // Attendance status
    status: {
      type: String,
      enum: ["Present", "Absent", "Late", "Excused"],
      default: "Absent",
      index: true,
    },

    // Optional remarks (medical leave, mission, etc.)
    remarks: {
      type: String,
      maxlength: 300,
    },
  },
  {
    timestamps: true,
  }
);

/**
 * Ensure one attendance record per teacher per day
 */
teacherAttendanceSchema.index(
  { teacher: 1, date: 1, academicYear: 1 },
  { unique: true }
);

module.exports = mongoose.model(
  "TeacherAttendance",
  teacherAttendanceSchema
);
