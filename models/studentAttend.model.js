const mongoose = require("mongoose");

/**
 * StudentAttendance Schema
 * Represents the daily attendance of a student.
 */
const studentAttendanceSchema = new mongoose.Schema(
  {
    // Campus where the attendance is recorded
    schoolCampus: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SchoolCampus",
      required: true,
      index: true,
    },

    // Student concerned
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },

    // Class in which the student is enrolled
    class: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Classes",
      required: true,
      index: true,
    },

    // Academic year (e.g. 2024-2025)
    academicYear: {
      type: String,
      required: true,
      index: true,
    },

    // Attendance date (day only)
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

    // Optional justification or remark
    remarks: {
      type: String,
      maxlength: 300,
    },
  },
  {
    timestamps: true, // createdAt & updatedAt
  }
);

/**
 * Ensure one attendance record per student per day per class
 */
studentAttendanceSchema.index(
  { student: 1, class: 1, date: 1, academicYear: 1 },
  { unique: true }
);

module.exports = mongoose.model(
  "StudentAttendance",
  studentAttendanceSchema
);
