const mongoose = require('mongoose');
require('dotenv').config(); // Charge votre fichier .env

const uri = process.env.MONGODB_URI || "VOTRE_URL_ICI_SI_PAS_DE_DOTENV";

console.log("Attempting to connect to MongoDB...");

mongoose.connect(uri)
  .then(() => {
    console.log("✅ Connexion réussie ! Le réseau et les identifiants sont corrects.");
    process.exit(0);
  })
  .catch(err => {
    console.error("❌ Erreur de connexion détectée :");
    console.error(err.message);
    process.exit(1);
  });