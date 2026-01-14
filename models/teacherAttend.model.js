const mongoose = require('mongoose');

const teacherAttendSchema = new mongoose.Schema({
  schoolCampus: {type: mongoose.Schema.ObjectId, ref: "SchoolCampus"},
  teacher: {type: mongoose.Schema.ObjectId, ref: "Teacher"},
  date: {type: Date, required: true},
  status: {type: String, enum:['Present', 'Absent'], default: 'Absent'},

  createdAt: {type: Date, default: new Date()}
});

module.exports = mongoose.model('TeacherAttendance', teacherAttendSchema);