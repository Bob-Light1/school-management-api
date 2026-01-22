const mongoose = require('mongoose');

/**
 * Examination Schema
 * This schema represents an examination session for a specific class
 * within a campus and for a given subject.
 */
const examinationSchema = new mongoose.Schema(
  {
    // Reference to the campus where the exam takes place
    schoolCampus: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SchoolCampus',
      required: true,
      index: true
    },

    // Reference to the class concerned by the exam
    class: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
      required: true,
      index: true
    },

    // Reference to the subject of the exam
    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subject',
      required: true
    },

    // Date and time when the exam is scheduled
    examDate: {
      type: Date,
      required: true
    },

    // Type of examination (midterm, final, quiz, mock, etc.)
    examType: {
      type: String,
      required: true,
      enum: ['quiz', 'midterm', 'final', 'mock', 'oral', 'practical']
    },

    // Maximum score obtainable for the exam
    maxScore: {
      type: Number,
      default: 100
    },

    // Current status of the examination
    status: {
      type: String,
      enum: ['scheduled', 'completed', 'cancelled'],
      default: 'scheduled'
    },

    // Optional description or instructions for the exam
    description: {
      type: String,
      trim: true
    }
  },
  {
    // Automatically adds createdAt and updatedAt fields
    timestamps: true
  }
);

// Prevent duplicate exams for the same class, subject and date
examinationSchema.index(
  { class: 1, subject: 1, examDate: 1 },
  { unique: true }
);

module.exports = mongoose.model('Examination', examinationSchema);
