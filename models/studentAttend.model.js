const mongoose = require('mongoose');

const studentAttendSchema = new mongoose.Schema({
  schoolCampus: {type: mongoose.Schema.ObjectId, ref: "SchoolCampus"},
  student: {type: mongoose.Schema.ObjectId, ref: "Student"},
  class: {type: mongoose.Schema.ObjectId, ref: "Class"},
  date: {type: Date, required: true},
  status: {type: String, enum:['Present', 'Absent'], default: 'Absent'},

  createdAt: {type: Date, default: new Date()}
});

module.exports = mongoose.model('StudentAttendance', studentAttendSchema);