const mongoose = require("mongoose");

/**
 * Parent Schema
 * Represents a parent or legal guardian of one or more students.
 */
const partnerSchema = new mongoose.Schema(
  {
    // Campus linked to the parent account
    schoolCampus: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SchoolCampus",
      required: true,
      index: true,
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
      sparse: true, // allows multiple null emails
    },

    gender: {
      type: String,
      enum: ["Male", "Female"],
      required: true,
    },

    phone: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    address: {
      type: String,
      required: true,
      maxlength: 300,
    },

    // Authentication
    password: {
      type: String,
      required: true,
      select: false,
    },

    // Account status
    status: {
      type: String,
      enum: ["active", "suspended"],
      default: "active",
      index: true,
    },

    // Last login timestamp
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
 * Virtual field to get full name
 */
partnerSchema.virtual("fullName").get(function () {
  return `${this.name} ${this.surname}`;
});

module.exports = mongoose.model("Parter", partnerSchema);
 