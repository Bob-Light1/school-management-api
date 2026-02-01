const express = require('express');
const {
  createResult,
  getAllResults,
  getResultById,
  updateResult,
  deleteResult,
  publishResult,
  unpublishResult,
  addClassManagerRemarks,
  getClassAverage,
  getStudentAverage,
  getTopPerformers
} = require('../controllers/result.controller');
const { authenticate, authorize } = require('../middleware/auth/auth');
const { apiLimiter } = require('../middleware/rate-limiter/rate-limiter');

const router = express.Router();

// Roles configuration
const STAFF_ROLES = ['ADMIN', 'DIRECTOR', 'CAMPUS_MANAGER', 'TEACHER'];
const ADMIN_ROLES = ['ADMIN', 'DIRECTOR', 'CAMPUS_MANAGER'];
const VIEW_ROLES = ['ADMIN', 'DIRECTOR', 'CAMPUS_MANAGER', 'TEACHER', 'STUDENT'];
const DELETE_ROLES = ['ADMIN', 'CAMPUS_MANAGER']; // Only managers can delete

// Apply authentication to all routes
router.use(authenticate);

// ========================================
// CREATE & LIST ROUTES
// ========================================

/**
 * @route   POST /api/result
 * @desc    Create/Enter a new result
 * @access  TEACHER, CAMPUS_MANAGER, ADMIN
 */
router.post(
  '/',
  authorize(STAFF_ROLES),
  createResult
);

/**
 * @route   GET /api/result
 * @desc    Get all results with filters
 * @access  ADMIN, DIRECTOR, CAMPUS_MANAGER, TEACHER, STUDENT
 * @note    Students see only their own published results
 *          Teachers see only results they entered
 *          Managers see all campus results
 */
router.get(
  '/',
  authorize(VIEW_ROLES),
  apiLimiter,
  getAllResults
);

// ========================================
// SPECIFIC QUERY ROUTES
// ========================================

/**
 * @route   GET /api/result/class/:classId/average
 * @desc    Get class average for a subject
 * @access  ADMIN, CAMPUS_MANAGER, TEACHER
 */
router.get(
  '/class/:classId/average',
  authorize(STAFF_ROLES),
  getClassAverage
);

/**
 * @route   GET /api/result/student/:studentId/average
 * @desc    Get student overall average
 * @access  ADMIN, CAMPUS_MANAGER, TEACHER, STUDENT (own average)
 */
router.get(
  '/student/:studentId/average',
  authorize(VIEW_ROLES),
  getStudentAverage
);

/**
 * @route   GET /api/result/top-performers
 * @desc    Get top performers in a class
 * @access  ADMIN, CAMPUS_MANAGER, TEACHER
 */
router.get(
  '/top-performers',
  authorize(STAFF_ROLES),
  getTopPerformers
);

/**
 * @route   GET /api/result/:id
 * @desc    Get result by ID
 * @access  ADMIN, DIRECTOR, CAMPUS_MANAGER, TEACHER, STUDENT (own result)
 */
router.get(
  '/:id',
  authorize(VIEW_ROLES),
  getResultById
);

// ========================================
// UPDATE ROUTES
// ========================================

/**
 * @route   PUT /api/result/:id
 * @desc    Update result (teacher can modify their own results)
 * @access  TEACHER (who entered it), CAMPUS_MANAGER, ADMIN
 */
router.put(
  '/:id',
  authorize(STAFF_ROLES),
  updateResult
);

/**
 * @route   PATCH /api/result/:id/publish
 * @desc    Publish result (make visible to students)
 * @access  TEACHER, CAMPUS_MANAGER, ADMIN
 */
router.patch(
  '/:id/publish',
  authorize(STAFF_ROLES),
  publishResult
);

/**
 * @route   PATCH /api/result/:id/unpublish
 * @desc    Unpublish result
 * @access  CAMPUS_MANAGER, ADMIN
 */
router.patch(
  '/:id/unpublish',
  authorize(ADMIN_ROLES),
  unpublishResult
);

/**
 * @route   PATCH /api/result/:id/remarks
 * @desc    Add class manager remarks to result
 * @access  CAMPUS_MANAGER, ADMIN
 */
router.patch(
  '/:id/remarks',
  authorize(ADMIN_ROLES),
  addClassManagerRemarks
);

// ========================================
// DELETE ROUTE
// ========================================

/**
 * @route   DELETE /api/result/:id
 * @desc    Delete result permanently
 * @access  CAMPUS_MANAGER, ADMIN only
 * @note    Teachers CANNOT delete results - only managers can
 */
router.delete(
  '/:id',
  authorize(DELETE_ROLES),
  deleteResult
);

module.exports = router;