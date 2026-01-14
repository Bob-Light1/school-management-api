const express = require('express');
const { 
  createCampus, 
  getAllCampus, 
  loginCampus, 
  updateCampus, 
  getOneCampus
} = require('../controllers/campus.controller');
const authMiddleware = require('../middleware/auth/auth');
const { loginLimiter, strictLimiter } = require('../middleware/rate-limiter/rate-limiter');
const router = express.Router();


router.get("/all", getAllCampus);
router.get("/single", authMiddleware(['CAMPUS_MANAGER', 'DIRECTOR']), getOneCampus)
router.post("/create", strictLimiter, createCampus);
router.post("/login",loginLimiter, loginCampus);
//router.post('/reset-password', strictLimiter, resetPassword);
router.patch("/update", authMiddleware(['CAMPUS_MANAGER', 'DIRECTOR']), updateCampus); //ONLY AUTHENTICATED USER CAN UPDATE


// Protected routes
//router.get('/campus/profile', authMiddleware(), getProfile);

// Protected route for CAMPUS_MANAGER
{/*router.post(
  '/create-student',
  authMiddleware(['CAMPUS_MANAGER']),
  createStudent
);
*/}

module.exports = router;