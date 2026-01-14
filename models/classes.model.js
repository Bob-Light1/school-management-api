const mongoose = require('mongoose');

const classSchema = new mongoose.Schema({
  schoolCampus: {type: mongoose.Schema.ObjectId, ref: 'SchoolCampus'},
  level: {type: mongoose.Schema.ObjectId, ref:'Level'},
  class_name: {type: String, required: true},
  class_manager: {type:mongoose.Schema.ObjectId, ref: 'Teacher'},

  createdAt: {type:Date, default: new Date()}
});

module.exports = mongoose.model('Classes', classSchema)