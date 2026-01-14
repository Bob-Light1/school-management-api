const mongoose = require('mongoose');

const scheduleSchema = new mongoose.Schema({
  schoolCampus: {type: mongoose.Schema.ObjectId, ref: "SchoolCampus"},
  class: {type: mongoose.Schema.ObjectId, ref: "Classes"},
  teacher: {type: mongoose.Schema.ObjectId, ref: "Teacher"},
  subject: {type: mongoose.Schema.ObjectId, ref: "Subject"},

  startTime: {type: Date, required: true},
  endTime: {type: Date, required: true},
  createdAt: {type: Date, default:new Date()}
});

module.exports = mongoose.model("Schedule", scheduleSchema)