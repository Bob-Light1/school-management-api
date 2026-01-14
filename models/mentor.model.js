const mongoose =require('mongoose');

const mentorSchema = new mongoose.Schema({
  schoolCampus: {type: mongoose.Schema.ObjectId, ref: 'SchoolCampus' },
  class: {type: mongoose.Schema.ObjectId, ref:'Classes'},
  name: {type: String, required: true},
  surname: {type: String, required: true},
  username: {type: String, required: true},
  password: {type: String, required: true},

  createdAt: {type: Date, default:new Date()}
});


module.exports = mongoose.model("Mentor", mentorSchema);