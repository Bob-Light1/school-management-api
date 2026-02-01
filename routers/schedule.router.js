const express = require('express');
const {
  createSchedule,
  getAllSchedules,
  getScheduleById,
  getClassSchedule,
  getTeacherSchedule,
  updateSchedule,
  cancelSchedule,
  deleteSchedulePermanently
} = require('../controllers/schedule.controller');
const { authenticate, authorize } = require('../middleware/auth/auth');
const { apiLimiter } = require('../middleware/rate-limiter/rate-limiter');

const router = express.Router();

// Roles configuration
const STAFF_ROLES = ['ADMIN', 'DIRECTOR', 'CAMPUS_MANAGER', 'TEACHER'];
const ADMIN_ROLES = ['ADMIN', 'DIRECTOR', 'CAMPUS_MANAGER'];
const VIEW_ROLES = ['ADMIN', 'DIRECTOR', 'CAMPUS_MANAGER', 'TEACHER', 'STUDENT'];

// Apply authentication to all routes
router.use(authenticate);

// ========================================
// CREATE & LIST ROUTES
// ========================================

/**
 * @route   POST /api/schedule
 * @desc    Create a new schedule entry
 * @access  ADMIN, DIRECTOR, CAMPUS_MANAGER
 */
router.post(
  '/',
  authorize(ADMIN_ROLES),
  createSchedule
);

/**
 * @route   GET /api/schedule
 * @desc    Get all schedules with filters
 * @access  ADMIN, DIRECTOR, CAMPUS_MANAGER, TEACHER
 */
router.get(
  '/',
  authorize(STAFF_ROLES),
  apiLimiter,
  getAllSchedules
);

// ========================================
// SPECIFIC QUERY ROUTES
// ========================================

/**
 * @route   GET /api/schedule/class/:classId
 * @desc    Get schedule for a specific class
 * @access  ADMIN, DIRECTOR, CAMPUS_MANAGER, TEACHER, STUDENT
 * @note    Students can view their class schedule
 */
router.get(
  '/class/:classId',
  authorize(VIEW_ROLES),
  getClassSchedule
);

/**
 * @route   GET /api/schedule/teacher/:teacherId
 * @desc    Get schedule for a specific teacher
 * @access  ADMIN, DIRECTOR, CAMPUS_MANAGER, TEACHER (own schedule)
 */
router.get(
  '/teacher/:teacherId',
  authorize(STAFF_ROLES),
  getTeacherSchedule
);

/**
 * @route   GET /api/schedule/:id
 * @desc    Get schedule by ID
 * @access  ADMIN, DIRECTOR, CAMPUS_MANAGER, TEACHER, STUDENT
 */
router.get(
  '/:id',
  authorize(VIEW_ROLES),
  getScheduleById
);

// ========================================
// UPDATE & DELETE ROUTES
// ========================================

/**
 * @route   PUT /api/schedule/:id
 * @desc    Update schedule
 * @access  ADMIN, DIRECTOR, CAMPUS_MANAGER
 */
router.put(
  '/:id',
  authorize(ADMIN_ROLES),
  updateSchedule
);

/**
 * @route   DELETE /api/schedule/:id
 * @desc    Cancel schedule (soft delete)
 * @access  ADMIN, DIRECTOR, CAMPUS_MANAGER
 */
router.delete(
  '/:id',
  authorize(ADMIN_ROLES),
  cancelSchedule
);

/**
 * @route   DELETE /api/schedule/:id/permanent
 * @desc    Permanently delete schedule
 * @access  ADMIN only
 */
router.delete(
  '/:id/permanent',
  authorize(['ADMIN']),
  deleteSchedulePermanently
);

module.exports = router;