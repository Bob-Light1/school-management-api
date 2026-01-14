const mongoose = require("mongoose");

const courseSchema = new mongoose.Schema(
  {
    // Relations
    level: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Level",
      required: true,
      index: true,
    },

    class: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Classes",
      required: true,
      index: true,
    },

    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      required: true,
      index: true,
    },

    instructor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Teacher",
      required: true,
    },

    // Infos principales
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 120,
    },

    slug: {
      type: String,
      unique: true,
      lowercase: true,
      index: true,
    },

    description: {
      type: String,
      required: true,
      minlength: 20,
    },

    shortDescription: {
      type: String,
      maxlength: 250,
    },

    language: {
      type: String,
      enum: ["fr", "en", "de"],
      default: "fr",
    },

    // Contenu
    duration: {
      type: Number, // minutes
      required: true,
      min: 1,
      max: 10,
    },

    lessonsCount: {
      type: Number,
      default: 0,
    },

    thumbnail: {
      type: String,
      default: "default-course.png",
    },

    // Prix & accès
    price: {
      type: Number,
      default: 0,
    },

    isFree: {
      type: Boolean,
      default: false,
    },

    accessType: {
      type: String,
      enum: ["student", "teaacher", "parent", "partner"],
      default: "student",
    },

    // Publication
    status: {
      type: String,
      enum: ["draft", "published", "archived"],
      default: "draft",
      index: true,
    },

    publishedAt: {
      type: Date,
    },

    // Statistiques
    studentsCount: {
      type: Number,
      default: 0,
    },

    rating: {
      average: { type: Number, default: 0, min: 0, max: 5 },
      count: { type: Number, default: 0 },
    },

    // SEO / recherche
    tags: [
      {
        type: String,
        lowercase: true,
        trim: true,
      },
    ],
  },
  {
    timestamps: true, // createdAt + updatedAt
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

module.exports = mongoose.model("Course", courseSchema);
