// routes/student.routes.js
const express = require('express');
const router = express.Router();

const studentController = require('../controllers/student.controller');
const parseFormData = require('../middleware/formidable/formidable');
const { authenticate, authorize, isOwnerOrRole } = require('../middleware/auth/auth');

// Public routes
router.post('/login', studentController.loginStudent);

// Protected routes - Require authentication
// Apply authentication to all routes below this line
router.use(authenticate);

/**
 * @route   POST /api/students
 * @desc    Create a new student
 * @access  ADMIN, CAMPUS_MANAGER
 */
router.post(
  '/',
  authorize(['ADMIN', 'CAMPUS_MANAGER']),
  parseFormData(), // Parse multipart/form-data
  studentController.createStudent
);

/**
 * @route   GET /api/students
 * @desc    Get all students with filters and pagination
 * @access  ADMIN, CAMPUS_MANAGER, TEACHER
 */
router.get(
  '/',
  authorize(['ADMIN', 'CAMPUS_MANAGER', 'TEACHER']),
  studentController.getAllStudents
);

/**
 * @route   GET /api/students/:id
 * @desc    Get a single student by ID
 * @access  ADMIN, CAMPUS_MANAGER, TEACHER, STUDENT (own profile)
 */
router.get(
  '/:id',
  // Allow if user is viewing their own profile OR is staff
  isOwnerOrRole('id', ['ADMIN', 'CAMPUS_MANAGER', 'TEACHER']),
  studentController.getOneStudent
);

/**
 * @route   PATCH /api/students/:id
 * @desc    Update student information
 * @access  ADMIN, CAMPUS_MANAGER
 */
router.patch(
  '/:id',
  authorize(['ADMIN', 'CAMPUS_MANAGER']),
  parseFormData(), // Parse multipart/form-data
  studentController.updateStudent
);

/**
 * @route   PATCH /api/students/:id/password
 * @desc    Update student password
 * @access  ADMIN, CAMPUS_MANAGER, STUDENT (own password)
 */
router.patch(
  '/:id/password',
  isOwnerOrRole('id', ['ADMIN', 'CAMPUS_MANAGER']),
  studentController.updateStudentPassword
);

/**
 * @route   DELETE /api/students/:id
 * @desc    Archive student (soft delete)
 * @access  ADMIN, CAMPUS_MANAGER
 */
router.delete(
  '/:id',
  authorize(['ADMIN', 'CAMPUS_MANAGER']),
  studentController.archiveStudent
);

/**
 * @route   PATCH /api/students/:id/restore
 * @desc    Restore archived student
 * @access  ADMIN, CAMPUS_MANAGER
 */
router.patch(
  '/:id/restore',
  authorize(['ADMIN', 'CAMPUS_MANAGER']),
  studentController.restoreStudent
);

/**
 * @route   DELETE /api/students/:id/permanent
 * @desc    Permanently delete student
 * @access  ADMIN only
 */
router.delete(
  '/:id/permanent',
  authorize(['ADMIN']),
  studentController.deleteStudentPermanently
);

module.exports = router;