const mongoose = require('mongoose');

const partnerSchema = new mongoose.Schema({
  name: {type: String, required: true},
  surname: {type: String, required: true},
  username: {type: String, required: true},
  qualification: {type: String, required: true},
  coupon_code: {type: String, unique:true, required: true},
  numberStudent: {type: Number, required: true},
  debt: {type: Number, default: 0},
  email: {type: String, required: true},
  addresse: {type: String, required: true},
  phone: {type: String, required: true},
  password: {type: String, required: true},

  createdAt: {type:Date, default: new Date()},
});

module.exports = mongoose.model("Partner", partnerSchema)