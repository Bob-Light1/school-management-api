const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  schoolCampus: {type: mongoose.Schema.ObjectId, ref: "SchoolCampus"},
  mentor: {type: mongoose.Schema.ObjectId, ref: "Mentor"},
  name: {type: String, required: true},
  surname: {type: String, required: true},
  username: {type: String, required: true},
  email: {type: String, required: false},
  phone: {type: String, required: true},
  student_class: {type: String, required: true},
  age: {type: String, required:true},
  gender: {type: String, required: true},
  password:{type: String, required:true},

  createdAt: {type:Date, default: new Date()}
});

module.exports = mongoose.model("Student", studentSchema)