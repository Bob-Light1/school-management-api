const mongoose = require('mongoose');

/**
 * Department Model
 * Represents an academic department within a campus.
 * Campus isolation enforced via schoolCampus field.
 */
const departmentSchema = new mongoose.Schema(
  {
    // **CAMPUS ASSIGNMENT**
    schoolCampus: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Campus',
      required: [true, 'Campus is required'],
      index: true,
    },

    // **IDENTIFICATION**
    name: {
      type: String,
      required: [true, 'Department name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [100, 'Name must not exceed 100 characters'],
    },

    code: {
      type: String,
      required: [true, 'Department code is required'],
      trim: true,
      uppercase: true,
      minlength: [2, 'Code must be at least 2 characters'],
      maxlength: [10, 'Code must not exceed 10 characters'],
      match: [/^[A-Z0-9-]+$/, 'Code can only contain uppercase letters, numbers and hyphens'],
    },

    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description must not exceed 500 characters'],
    },

    // **HEAD OF DEPARTMENT**
    headOfDepartment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Teacher',
      default: null,
    },

    // **STATUS**
    status: {
      type: String,
      enum: {
        values: ['active', 'inactive', 'archived'],
        message: '{VALUE} is not a valid status',
      },
      default: 'active',
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// **COMPOUND INDEXES**
// Name must be unique per campus
departmentSchema.index({ schoolCampus: 1, name: 1 }, { unique: true });
// Code must be unique per campus
departmentSchema.index({ schoolCampus: 1, code: 1 }, { unique: true });
departmentSchema.index({ schoolCampus: 1, status: 1 });
departmentSchema.index({ createdAt: -1 });

// **VIRTUALS**
departmentSchema.virtual('teacherCount', {
  ref: 'Teacher',
  localField: '_id',
  foreignField: 'department',
  count: true,
});

// **PRE-SAVE**
departmentSchema.pre('save', function () {
  if (this.code) this.code = this.code.toUpperCase().trim();
  if (this.name) this.name = this.name.trim();
});

// **STATICS**
departmentSchema.statics.findActiveByCampus = function (campusId) {
  return this.find({ schoolCampus: campusId, status: 'active' }).sort({ name: 1 });
};

departmentSchema.statics.countByCampus = function (campusId) {
  return this.countDocuments({ schoolCampus: campusId, status: { $ne: 'archived' } });
};

const Department = mongoose.model('Department', departmentSchema);
module.exports = Department;