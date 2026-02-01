const express = require('express');
const router = express.Router();

const teacherController = require('../controllers/teacher.controller');
const parseFormData = require('../middleware/formidable/formidable');
const { authenticate, authorize, isOwnerOrRole } = require('../middleware/auth/auth');
const { loginLimiter, apiLimiter } = require('../middleware/rate-limiter/rate-limiter');

// Role configurations
const ADMIN_ROLES = ['ADMIN', 'DIRECTOR', 'CAMPUS_MANAGER'];
const STAFF_VIEW_ROLES = ['ADMIN', 'DIRECTOR', 'CAMPUS_MANAGER', 'TEACHER'];

// ========================================
// PUBLIC ROUTES (No Authentication)
// ========================================

/**
 * @route   POST /api/teacher/login
 * @desc    Teacher login
 * @access  Public
 */
router.post('/login', loginLimiter, teacherController.loginTeacher);

// ========================================
// PROTECTED ROUTES (Authentication Required)
// All routes below require authentication
// ========================================
router.use(authenticate);

// ========================================
// TEACHER CREATION & LISTING
// ========================================

/**
 * @route   POST /api/teacher
 * @desc    Create a new teacher
 * @access  ADMIN, DIRECTOR, CAMPUS_MANAGER
 * @note    Campus is automatically assigned based on user role
 *          Classes must belong to the same campus
 */
router.post(
  '/',
  authorize(ADMIN_ROLES),
  parseFormData(), // Parse multipart/form-data for image upload
  teacherController.createTeacher
);

/**
 * @route   GET /api/teacher
 * @desc    Get all teachers with filters and pagination
 * @access  ADMIN, DIRECTOR, CAMPUS_MANAGER
 * @query   page, limit, search, status, gender, employmentType, campusId (ADMIN only)
 * @note    🔥 CRITICAL FIX: Campus isolation enforced
 *          Managers can ONLY see teachers from their campus
 */
router.get(
  '/',
  authorize(ADMIN_ROLES),
  apiLimiter,
  teacherController.getAllTeachers
);

// ========================================
// INDIVIDUAL TEACHER ROUTES
// ========================================

/**
 * @route   GET /api/teacher/:id
 * @desc    Get a single teacher by ID
 * @access  ADMIN, DIRECTOR, CAMPUS_MANAGER, TEACHER (own profile)
 * @note    Teachers can view their own profile
 *          Staff can view teachers from their campus
 */
router.get(
  '/:id',
  isOwnerOrRole('id', ADMIN_ROLES),
  teacherController.getOneTeacher
);

/**
 * @route   PATCH /api/teacher/:id
 * @desc    Update teacher information
 * @access  ADMIN, DIRECTOR, CAMPUS_MANAGER
 * @note    Cannot change campus, password, or salary via this route
 *          Classes must belong to the same campus
 */
router.patch(
  '/:id',
  authorize(ADMIN_ROLES),
  parseFormData(), // Parse multipart/form-data for image upload
  teacherController.updateTeacher
);

/**
 * @route   PATCH /api/teacher/:id/password
 * @desc    Update teacher password
 * @access  ADMIN, DIRECTOR, CAMPUS_MANAGER, TEACHER (own password)
 * @note    Teachers must provide current password
 *          Admins can change any password without current password
 */
router.patch(
  '/:id/password',
  isOwnerOrRole('id', ADMIN_ROLES),
  teacherController.updateTeacherPassword
);

// ========================================
// TEACHER ARCHIVE & DELETION
// ========================================

/**
 * @route   DELETE /api/teacher/:id
 * @desc    Archive teacher (soft delete)
 * @access  ADMIN, DIRECTOR
 * @note    Sets status to 'archived', doesn't delete from database
 */
router.delete(
  '/:id',
  authorize(['ADMIN', 'DIRECTOR']),
  teacherController.archiveTeacher
);

/**
 * @route   PATCH /api/teacher/:id/restore
 * @desc    Restore archived teacher
 * @access  ADMIN, DIRECTOR
 * @note    Sets status back to 'active'
 */
router.patch(
  '/:id/restore',
  authorize(['ADMIN', 'DIRECTOR']),
  teacherController.restoreTeacher
);

/**
 * @route   DELETE /api/teacher/:id/permanent
 * @desc    Permanently delete teacher
 * @access  ADMIN only
 * @note    ⚠️ DESTRUCTIVE - Cannot be undone, also deletes teacher image
 */
router.delete(
  '/:id/permanent',
  authorize(['ADMIN']),
  teacherController.deleteTeacherPermanently
);

module.exports = router;