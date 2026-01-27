const express = require('express');
const { 
  createAdmin, 
  loginAdmin, 
} = require('../controllers/admin.controller');

// Import des nouvelles fonctions du middleware
const { loginLimiter, strictLimiter } = require('../middleware/rate-limiter/rate-limiter');

const router = express.Router();

// Public routes (no authentication required)
router.post("/login", loginLimiter, loginAdmin);

router.post(
  "/create", 
  strictLimiter,
  createAdmin
);

module.exports = router;