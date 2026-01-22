const mongoose = require("mongoose");

/**
 * Result Schema
 * This schema represents the result of a student for a specific examination.
 */
const resultSchema = new mongoose.Schema(
  {
    // Main relations
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },

    exam: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Examination",
      required: true,
      index: true,
    },

    class: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Class",
      required: true,
      index: true,
    },

    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Teacher",
      required: true,
    },

    // Scores
    score: {
      type: Number,
      required: true,
      min: 0,
    },

    // Maximum score for this exam (snapshot for data integrity)
    maxScore: {
      type: Number,
      required: true,
      default: 20,
    },

    // Calculated percentage
    percentage: {
      type: Number,
      min: 0,
      max: 100,
    },

    // Letter grade (A, B, C, D, E, F)
    grade: {
      type: String,
    },

    // Academic mention based on percentage
    mention: {
      type: String,
      enum: [
        "Excellent",
        "Très bien",
        "Bien",
        "Assez bien",
        "Passable",
        "Insuffisant",
      ],
    },

    // Pass / fail status
    status: {
      type: String,
      enum: ["pass", "fail"],
      index: true,
    },

    // Teacher remarks
    remarks: {
      type: String,
      maxlength: 500,
    },

    // Correction date
    correctedAt: {
      type: Date,
    },

    // Academic metadata
    academicYear: {
      type: String, // e.g. 2024-2025
      required: true,
      index: true,
    },

    semester: {
      type: String,
      enum: ["S1", "S2", "Annuel"],
      required: true,
    },

    // Publication metadata
    isPublished: {
      type: Boolean,
      default: false,
      index: true,
    },

    publishedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

/**
 * Automatically compute percentage, status and mention before saving
 */
resultSchema.pre("save", function (next) {
  // Calculate percentage
  this.percentage = (this.score / this.maxScore) * 100;

  // Determine pass or fail
  this.status = this.percentage >= 50 ? "pass" : "fail";

  // Determine academic mention
  if (this.percentage >= 80) this.mention = "Excellent";
  else if (this.percentage >= 70) this.mention = "Très bien";
  else if (this.percentage >= 60) this.mention = "Bien";
  else if (this.percentage >= 50) this.mention = "Assez bien";
  else this.mention = "Insuffisant";

  next();
});

/**
 * Ensure a student has only one result per examination
 */
resultSchema.index({ student: 1, exam: 1 }, { unique: true });

module.exports = mongoose.model("Result", resultSchema);
