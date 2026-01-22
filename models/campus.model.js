const mongoose = require('mongoose');

const campusSchema = new mongoose.Schema(
  {
    campus_name: {
      type: String,
      required: true,
      trim: true
    },

    campus_number: {
      type: String,
      trim: true
    },

    manager_name: {
      type: String,
      required: true,
      trim: true
    },

    manager_phone: {
      type: String,
      trim: true,
      match: [/^\+?[0-9\s]{6,20}$/, 'Invalide phone number']
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid Email']
    },

    campus_image: {
      type: String,
      required: true
    },

    password: {
      type: String,
      required: true,
      select: false
    },

    location: {
      address: {
        type: String,
        trim: true
      },
      city: {
        type: String,
        trim: true
      },
      country: {
        type: String,
        default: 'Cameroun'
      },
      coordinates: {
        lat: { type: Number },
        lng: { type: Number }
      }
    },

    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active'
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('SchoolCampus', campusSchema);
