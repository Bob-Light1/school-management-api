const mongoose = require('mongoose');

const levelSchema = new mongoose.Schema({
  name: {type: String, default: 'A1', require: true},

  createdAt: {type: Date, default: new Date()}
});

module.exports = mongoose.model("Level", levelSchema);