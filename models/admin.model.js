const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema(
  {
    admin_name: {
      type: String,
      required: true,
      trim: true
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid Email']
    },

    password: {
      type: String,
      required: true,
      select: false
    }
  },
);

module.exports = mongoose.model('Admin', adminSchema);
