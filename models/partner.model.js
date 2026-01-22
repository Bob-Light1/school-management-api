const mongoose = require("mongoose");

/**
 * Schedule Schema
 * Represents a class timetable entry.
 */
const scheduleSchema = new mongoose.Schema(
  {
    // Campus where the schedule applies
    schoolCampus: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SchoolCampus",
      required: true,
      index: true,
    },

    // Class concerned by the schedule
    class: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Classes",
      required: true,
      index: true,
    },

    // Subject being taught
    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      required: true,
    },

    // Teacher assigned to the class
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Teacher",
      required: true,
      index: true,
    },

    // Day of the week
    dayOfWeek: {
      type: String,
      enum: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
      required: true,
      index: true,
    },

    // Start time of the course
    startTime: {
      type: String, // HH:mm format
      required: true,
    },

    // End time of the course
    endTime: {
      type: String, // HH:mm format
      required: true,
    },

    // Optional classroom or room number
    room: {
      type: String,
      trim: true,
    },

    // Academic year (e.g. 2024-2025)
    academicYear: {
      type: String,
      required: true,
      index: true,
    },

    // Semester
    semester: {
      type: String,
      enum: ["S1", "S2", "Annuel"],
      required: true,
    },

    // Schedule status
    status: {
      type: String,
      enum: ["active", "cancelled"],
      default: "active",
      index: true,
    },
  },
  {
    timestamps: true, // createdAt & updatedAt
  }
);

/**
 * Validate that startTime is before endTime
 */
scheduleSchema.pre("save", function (next) {
  if (this.startTime >= this.endTime) {
    return next(new Error("Start time must be before end time"));
  }
  next();
});

/**
 * Prevent duplicate schedules for the same class and time slot
 */
scheduleSchema.index(
  {
    class: 1,
    dayOfWeek: 1,
    startTime: 1,
    endTime: 1,
    academicYear: 1,
    semester: 1,
  },
  { unique: true }
);

module.exports = mongoose.model("Schedule", scheduleSchema);
