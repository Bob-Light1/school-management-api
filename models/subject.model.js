const mongoose = require("mongoose");

/**
 * Subject Schema
 * Represents an academic subject taught in a campus.
 */
const subjectSchema = new mongoose.Schema(
  {
    // Campus where the subject is taught
    schoolCampus: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SchoolCampus",
      required: true,
      index: true,
    },

    // Subject name (e.g. Mathematics, Physics)
    subject_name: {
      type: String,
      required: true,
      trim: true,
    },

    // Unique subject code (e.g. MATH101)
    subject_code: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },

    // Short description of the subject
    description: {
      type: String,
      maxlength: 500,
    },

    // Subject coefficient used in grade calculations
    coefficient: {
      type: Number,
      default: 1,
      min: 0,
    },

    // Subject status (active / archived)
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    // Optional color for UI display
    color: {
      type: String, // e.g. #FF5733
    },
  },
  {
    timestamps: true, // createdAt & updatedAt
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

/**
 * Ensure subject code is unique per campus
 */
subjectSchema.index(
  { schoolCampus: 1, subject_code: 1 },
  { unique: true }
);

module.exports = mongoose.model("Subject", subjectSchema);
