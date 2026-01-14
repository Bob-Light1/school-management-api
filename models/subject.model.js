const mongoose = require('mongoose');

const subjectSchema = new mongoose.Schema({
  subject_name: {type: String, required: true},
  subject_code: {type: String, required: true},

  createdAt: {type: Date, default: new Date()}
});

module.exports = mongoose.model("Subject", subjectSchema);