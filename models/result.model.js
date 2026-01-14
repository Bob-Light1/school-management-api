const mongoose = require("mongoose");

const resultSchema = new mongoose.Schema(
  {
    // Relations principales
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },

    exam: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Exam",
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

    // Notes
    score: {
      type: Number,
      required: true,
      min: 0,
    },

    maxScore: {
      type: Number,
      required: true,
      default: 20,
    },

    percentage: {
      type: Number,
      min: 0,
      max: 100,
    },

    grade: {
      type: String, // A, B, C, D, E, F
    },

    mention: {
      type: String,
      enum: ["Excellent", "Très bien", "Bien", "Assez bien", "Passable", "Insuffisant"],
    },

    // Statut
    status: {
      type: String,
      enum: ["pass", "fail"],
      index: true,
    },

    // Détails de correction
    remarks: {
      type: String,
      maxlength: 500,
    },

    correctedAt: {
      type: Date,
    },

    // Historique / audit
    academicYear: {
      type: String, // ex: 2024-2025
      required: true,
      index: true,
    },

    semester: {
      type: String,
      enum: ["S1", "S2", "Annuel"],
      required: true,
    },

    // Métadonnées
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


resultSchema.pre("save", function (next) {
  this.percentage = (this.score / this.maxScore) * 100;

  if (this.percentage >= 50) {
    this.status = "pass";
  } else {
    this.status = "fail";
  }

  next();
});


resultSchema.pre("save", function (next) {
  if (this.percentage >= 80) this.mention = "Excellent";
  else if (this.percentage >= 70) this.mention = "Très bien";
  else if (this.percentage >= 60) this.mention = "Bien";
  else if (this.percentage >= 50) this.mention = "Assez bien";
  else this.mention = "Insuffisant";

  next();
});

resultSchema.index(
  { student: 1, exam: 1 },
  { unique: true }
);

module.exports = mongoose.model("Result", resultSchema);
