const express = require('express');
const { 
  createCampus, 
  getAllCampus, 
  loginCampus, 
  updateCampus, 
  getOneCampus,
  updateCampusPassword,
  deleteCampus,
  getCampusContext,
  getCampusStaff,
  getCampusClasses,
  getCampusTeachers,
  getCampusStudents,
  getCampusDashboardStats,
  getCampusStudentsStats
} = require('../controllers/campus.controller');

const { authenticate, authorize } = require('../middleware/auth/auth');
const { loginLimiter, strictLimiter, apiLimiter } = require('../middleware/rate-limiter/rate-limiter');

// MULTER: Import upload middleware
const { 
  uploadCampusImage, 
  handleMulterError 
} = require('../middleware/upload/upload');

const router = express.Router();

// ========================================
// PUBLIC ROUTES (No Authentication)
// ========================================

/**
 * @route   POST /api/campus/login
 * @desc    Campus manager login
 * @access  Public
 */
router.post("/login", loginLimiter, loginCampus);

/**
 * @route   GET /api/campus/all
 * @desc    Get all campuses (with pagination)
 * @access  Public
 * @note    Consider adding authentication if this contains sensitive data
 */
router.get("/all", apiLimiter, getAllCampus);

// ========================================
// PROTECTED ROUTES (Authentication Required)
// All routes below require authentication
// ========================================
router.use(authenticate);

// ========================================
// CAMPUS MANAGEMENT ROUTES
// ========================================

/**
 * @route   POST /api/campus/create
 * @desc    Create a new campus
 * @access  ADMIN, DIRECTOR only
 */
router.post(
  "/create", 
  strictLimiter,
  authorize(['ADMIN', 'DIRECTOR']),
  uploadCampusImage,     // Multer middleware handles image upload
  handleMulterError,     // Multer error handler
  createCampus
);

/**
 * @route   GET /api/campus/:id
 * @desc    Get single campus details
 * @access  ADMIN, DIRECTOR, CAMPUS_MANAGER (own campus only)
 */
router.get(
  "/:id", 
  authorize(['ADMIN', 'DIRECTOR', 'CAMPUS_MANAGER']),
  getOneCampus
);

/**
 * @route   PUT /api/campus/:id
 * @desc    Update campus information
 * @access  ADMIN, DIRECTOR, CAMPUS_MANAGER (own campus only)
 */
router.put(
  "/:id", 
  authorize(['ADMIN', 'DIRECTOR', 'CAMPUS_MANAGER']),
  uploadCampusImage,     //Optional image upload
  handleMulterError,
  updateCampus
);

/**
 * @route   PATCH /api/campus/:id/password
 * @desc    Update campus password
 * @access  ADMIN, DIRECTOR, CAMPUS_MANAGER (own campus only)
 */
router.patch(
  "/:id/password", 
  authorize(['ADMIN', 'DIRECTOR', 'CAMPUS_MANAGER']), 
  updateCampusPassword
);

/**
 * @route   DELETE /api/campus/:id
 * @desc    Archive/delete campus
 * @access  ADMIN, DIRECTOR only
 */
router.delete(
  "/:id", 
  authorize(['ADMIN', 'DIRECTOR']), 
  deleteCampus
);

// ========================================
// CAMPUS CONTEXT & RESOURCES ROUTES
// ========================================

/**
 * @route   GET /api/campus/:campusId/context
 * @desc    Get campus context with basic statistics
 * @access  ADMIN, DIRECTOR, CAMPUS_MANAGER
 */
router.get(
  "/:campusId/context", 
  authorize(['ADMIN', 'DIRECTOR', 'CAMPUS_MANAGER']), 
  getCampusContext
);

/**
 * @route   GET /api/campus/:campusId/dashboard
 * @desc    Get campus dashboard statistics
 * @access  ADMIN, DIRECTOR, CAMPUS_MANAGER
 */
router.get(
  "/:campusId/dashboard", 
  authorize(['ADMIN', 'DIRECTOR', 'CAMPUS_MANAGER']), 
  getCampusDashboardStats
);

// ========================================
// CAMPUS RESOURCES ROUTES
// ========================================

/**
 * @route   GET /api/campus/:campusId/students
 * @desc    Get all students in a campus
 * @access  ADMIN, DIRECTOR, CAMPUS_MANAGER
 */
router.get(
  "/:campusId/students", 
  authorize(['ADMIN', 'DIRECTOR', 'CAMPUS_MANAGER']), 
  getCampusStudents
);

/**
 * @route   GET /api/campus/:campusId/teachers
 * @desc    Get all teachers in a campus
 * @access  ADMIN, DIRECTOR, CAMPUS_MANAGER
 */
router.get(
  "/:campusId/teachers", 
  authorize(['ADMIN', 'DIRECTOR', 'CAMPUS_MANAGER']), 
  getCampusTeachers
);

/**
 * @route   GET /api/campus/:id/classes
 * @desc    Get all classes in a campus
 * @access  ADMIN, DIRECTOR, CAMPUS_MANAGER
 */
router.get(
  "/:id/classes", 
  authorize(['ADMIN', 'DIRECTOR', 'CAMPUS_MANAGER']), 
  getCampusClasses
);

/**
 * @route   GET /api/campus/:campusId/students/stats
 * @desc    Get students statistics for all the campus
 * @access  ADMIN, DIRECTOR, CAMPUS_MANAGER
 * @note    Administration should be able to see directly all important statistics
 */
router.get(
  '/:campusId/students/stats', 
  authorize(['ADMIN', 'DIRECTOR', 'CAMPUS_MANAGER']),
  getCampusStudentsStats
);

/**
 * @route   GET /api/campus/:id/staff
 * @desc    Get all staff in a campus
 * @access  ADMIN, DIRECTOR, CAMPUS_MANAGER
 */
/** router.get(
  *  "/:id/staff", 
  *  authorize(['ADMIN', 'DIRECTOR', 'CAMPUS_MANAGER']), 
  *  getCampusStaff
  *)
  */

module.exports = router;