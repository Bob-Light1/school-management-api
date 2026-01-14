const mongoose = require('mongoose');

const examinationSchema = new mongoose.Schema({
  schoolCampus: {type: mongoose.Schema.ObjectId, ref: "SchoolCampus"},
  class: {type: mongoose.Schema.ObjectId, ref: "Classes"},
  subject: {type: mongoose.Schema.ObjectId, ref: "Subject"},
  examDate: {type: Date, required: true},
  examType: {type: String, requires: true},

  createdAt: {type: Date, default:new Date()}
});

module.exports = mongoose.model("Examination", examinationSchema);