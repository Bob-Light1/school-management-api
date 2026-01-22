const mongoose = require('mongoose');

const classSchema = new mongoose.Schema(
  {
    schoolCampus: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SchoolCampus',
      required: true,
    },

    level: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Level',
      required: true
    },

    className: {
      type: String,
      required: true,
      trim: true
    },

    classManager: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Teacher'
    },

    students: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student'
      }
    ],

    status: {
      type: String,
      enum: ['active', 'inactive', 'archived'],
      default: 'active'
    },

    maxStudents: {
      type: Number,
      default: 50
    }
  },
  {
    timestamps: true // createdAt + updatedAt automatic
  }
);

// Prevents duplicate classes in the same campus and level
classSchema.index(
  { schoolCampus: 1, level: 1, className: 1 },
  { unique: true }
);

module.exports = mongoose.model('Class', classSchema);