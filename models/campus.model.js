const mongoose = require('mongoose');

const  campusSchema = new mongoose.Schema({
  campus_name: {type: String, required: true},
  campus_number: {type: String},
  manager_name: {type: String, required: true},
  email: {type: String, required: true, unique: true,},
  campus_image: {type: String, required: true},
  password: {type: String, required: true, select:false},

  createdAt: {type: Date, default:new Date()}
});

module.exports = mongoose.model("SchoolCampus", campusSchema)