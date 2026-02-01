const mongoose = require("mongoose");

/**
 * staff Schema
 * Represents a staff responsible for personalized student follow-up.
 */
const staffSchema = new mongoose.Schema(
  {
    // Campus where the staff operates
    schoolCampus: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SchoolCampus",
      required: true,
    },
    
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
      default: ['staff']
      // ex: ['teacher', 'class_manager', 'admin']
    },

    // staff status
    status: {
      type: String,
      enum: ["active", "inactive", "suspended"],
      default: "active",
      index: true,
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
 * Virtual field to get staff full name
 */
staffSchema.virtual("fullName").get(function () {
  return `${this.name} ${this.surname}`;
});

module.exports = mongoose.model("Staff", staffSchema);
