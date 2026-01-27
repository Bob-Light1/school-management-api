const express = require('express');
const { 
  createCampus, 
  getAllCampus, 
  loginCampus, 
  updateCampus, 
  getOneCampus,
  updateCampusPassword,
  deleteCampus
} = require('../controllers/campus.controller');

// Import des nouvelles fonctions du middleware
const { authenticate, authorize } = require('../middleware/auth/auth');
const { loginLimiter, strictLimiter } = require('../middleware/rate-limiter/rate-limiter');

const router = express.Router();

// Public routes (no authentication required)
router.post("/login", loginLimiter, loginCampus);

// Semi-public route (might not need authentication depending on use case)
router.get("/all", getAllCampus);

// Protected routes - Apply authentication first, then authorization
router.get(
  "/single", 
  authenticate,
  authorize(['ADMIN', 'CAMPUS_MANAGER', 'DIRECTOR']),
  getOneCampus
);

router.post(
  "/create", 
  strictLimiter,
  authenticate,
  authorize(['ADMIN', 'DIRECTOR']),
  createCampus
);

router.put(
  "/update/:id", 
  authenticate,
  authorize(['ADMIN', 'CAMPUS_MANAGER', 'DIRECTOR']), 
  updateCampus
);

router.patch(
  "/:id/password", 
  authenticate, 
  authorize(['CAMPUS_MANAGER', 'DIRECTOR', 'ADMIN']), 
  updateCampusPassword
);
router.delete(
  "/:id", 
  authenticate, 
  authorize(['ADMIN', 'DIRECTOR']), 
  deleteCampus
);

module.exports = router;