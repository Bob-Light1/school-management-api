const express = require('express');
const router = express.Router();

const teacherController = require('../controllers/teacher.controller');
const parseFormData = require('../middleware/formidable.middleware');
const { authenticate, authorize, isOwnerOrRole } = require('../middleware/auth/auth');

// Roles configuration
const ADMIN_ROLES = ['ADMIN', 'CAMPUS_MANAGER', 'DIRECTOR'];
const STAFF_ROLES = ['ADMIN', 'CAMPUS_MANAGER', 'DIRECTOR', 'TEACHER'];

/**
 * @route   POST /api/teacher/login
 * @desc    Teacher login
 * @access  Public
 */
router.post('/login', teacherController.loginTeacher);

// Apply authentication to all routes below
router.use(authenticate);

/**
 * @route   POST /api/teacher
 * @desc    Create a new teacher
 * @access  ADMIN, CAMPUS_MANAGER, DIRECTOR
 */
router.post(
  '/',
  authorize(ADMIN_ROLES),
  parseFormData(),
  teacherController.createTeacher
);

/**
 * @route   GET /api/teacher
 * @desc    Get all teachers with filters and pagination
 * @access  ADMIN, CAMPUS_MANAGER, DIRECTOR
 */
router.get(
  '/',
  authorize(ADMIN_ROLES),
  teacherController.getAllTeachers
);

/**
 * @route   GET /api/teacher/:id
 * @desc    Get a single teacher by ID
 * @access  ADMIN, CAMPUS_MANAGER, DIRECTOR, TEACHER (own profile)
 */
router.get(
  '/:id',
  isOwnerOrRole('id', ADMIN_ROLES),
  teacherController.getOneTeacher
);

/**
 * @route   PATCH /api/teacher/:id
 * @desc    Update teacher information
 * @access  ADMIN, CAMPUS_MANAGER, DIRECTOR
 */
router.patch(
  '/:id',
  authorize(ADMIN_ROLES),
  parseFormData(),
  teacherController.updateTeacher
);

/**
 * @route   PATCH /api/teacher/:id/password
 * @desc    Update teacher password
 * @access  ADMIN, CAMPUS_MANAGER, DIRECTOR, TEACHER (own password)
 */
router.patch(
  '/:id/password',
  isOwnerOrRole('id', ADMIN_ROLES),
  teacherController.updateTeacherPassword
);

/**
 * @route   DELETE /api/teacher/:id
 * @desc    Archive teacher (soft delete)
 * @access  ADMIN, DIRECTOR
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
 */
router.delete(
  '/:id/permanent',
  authorize(['ADMIN']),
  teacherController.deleteTeacherPermanently
);

module.exports = router;