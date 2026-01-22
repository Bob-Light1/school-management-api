const mongoose = require("mongoose");

/**
 * Mentor Schema
 * Represents a mentor responsible for personalized student follow-up.
 */
const mentorSchema = new mongoose.Schema(
  {
    // Campus where the mentor operates
    schoolCampus: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SchoolCampus",
      required: true,
      index: true,
    },

    // Classes supervised by the mentor
    classes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Classes",
        index: true,
      },
    ],

    // Students directly followed by the mentor
    students: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Student",
        index: true,
      },
    ],

    // Personal information
    name: {
      type: String,
      required: true,
      trim: true,
    },

    surname: {
      type: String,
      required: true,
      trim: true,
    },

    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },

    email: {
      type: String,
      lowercase: true,
      trim: true,
      unique: true,
      sparse: true,
    },

    phone: {
      type: String,
      unique: true,
      sparse: true,
    },

    // Authentication
    password: {
      type: String,
      required: true,
      select: false,
    },

    roles: {
      type: [String],
      default: ['MENTOR']
      // ex: ['teacher', 'class_manager', 'admin']
    },

    // Mentor status
    status: {
      type: String,
      enum: ["active", "inactive", "suspended"],
      default: "active",
      index: true,
    },

    // Area of expertise (optional)
    specialization: {
      type: String,
      maxlength: 200,
    },

    // Last login
    lastLoginAt: {
      type: Date,
    },
  },
  {
    timestamps: true, // createdAt & updatedAt
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

/**
 * Virtual field to get mentor full name
 */
mentorSchema.virtual("fullName").get(function () {
  return `${this.name} ${this.surname}`;
});

module.exports = mongoose.model("Mentor", mentorSchema);
