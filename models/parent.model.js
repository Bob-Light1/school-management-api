const mongoose = require('mongoose');

const parentSchema = new mongoose.Schema({
  student: {type: mongoose.Schema.ObjectId, ref:'Student'},
  name: {type: String, required: true},
  surname: {type: String, required: true},
  username: {type: String, required: true},
  email: {type: String, required: false},
  gender: {type: String, required: true},
  address: {type: String, required: true},
  phone: {type: String, required: true},
  password: {type: String, required:true},

  createdAt: {type:Date, default: new Date()}
});

module.exports = mongoose.model("Parent", parentSchema)