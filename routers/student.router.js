const express = require('express');
const router = express.Router();

const studentController = require('../controllers/student.controller');
const parseFormData = require('../middleware/formidable/formidable');
const { authenticate, authorize, isOwnerOrRole } = require('../middleware/auth/auth');
const { loginLimiter, apiLimiter } = require('../middleware/rate-limiter/rate-limiter');

// ========================================
// PUBLIC ROUTES (No Authentication)
// ========================================

/**
 * @route   POST /api/students/login
 * @desc    Student login
 * @access  Public
 */
router.post('/login', loginLimiter, studentController.loginStudent);

// ========================================
// PROTECTED ROUTES (Authentication Required)
// All routes below require authentication
// ========================================
router.use(authenticate);

// ========================================
// STUDENT CREATION & LISTING
// ========================================

/**
 * @route   POST /api/students
 * @desc    Create a new student
 * @access  ADMIN, DIRECTOR, CAMPUS_MANAGER
 * @note    Campus is automatically assigned based on user role
 */
router.post(
  '/',
  authorize(['ADMIN', 'DIRECTOR', 'CAMPUS_MANAGER']),
  parseFormData(), // Parse multipart/form-data for image upload
  studentController.createStudent
);

/**
 * @route   GET /api/students
 * @desc    Get all students with filters and pagination
 * @access  ADMIN, DIRECTOR, CAMPUS_MANAGER, TEACHER
 * @query   page, limit, search, status, classId, campusId (ADMIN only)
 * @note    Campus isolation enforced - managers see only their campus
 */
router.get(
  '/',
  authorize(['ADMIN', 'DIRECTOR', 'CAMPUS_MANAGER', 'TEACHER']),
  apiLimiter,
  studentController.getAllStudents
);

// ========================================
// INDIVIDUAL STUDENT ROUTES
// ========================================

/**
 * @route   GET /api/students/:id
 * @desc    Get a single student by ID
 * @access  ADMIN, DIRECTOR, CAMPUS_MANAGER, TEACHER, STUDENT (own profile)
 * @note    Students can only view their own profile
 *          Staff can view students from their campus
 */
router.get(
  '/:id',
  isOwnerOrRole('id', ['ADMIN', 'DIRECTOR', 'CAMPUS_MANAGER', 'TEACHER']),
  studentController.getOneStudent
);

/**
 * @route   PUT /api/students/:id
 * @desc    Update student information
 * @access  ADMIN, DIRECTOR, CAMPUS_MANAGER
 * @note    Cannot change campus or password via this route
 */
router.put(
  '/:id',
  authorize(['ADMIN', 'DIRECTOR', 'CAMPUS_MANAGER']),
  parseFormData(), // Parse multipart/form-data for image upload
  studentController.updateStudent
);

/**
 * @route   PATCH /api/students/:id/password
 * @desc    Update student password
 * @access  ADMIN, DIRECTOR, CAMPUS_MANAGER, STUDENT (own password)
 * @note    Students must provide current password
 *          Admins can change any password without current password
 */
router.patch(
  '/:id/password',
  isOwnerOrRole('id', ['ADMIN', 'DIRECTOR', 'CAMPUS_MANAGER']),
  studentController.updateStudentPassword
);

// ========================================
// STUDENT ARCHIVE & DELETION
// ========================================

/**
 * @route   DELETE /api/students/:id
 * @desc    Archive student (soft delete)
 * @access  ADMIN, DIRECTOR, CAMPUS_MANAGER
 * @note    Sets status to 'archived', doesn't delete from database
 */
router.delete(
  '/:id',
  authorize(['ADMIN', 'DIRECTOR', 'CAMPUS_MANAGER']),
  studentController.archiveStudent
);

/**
 * @route   PATCH /api/students/:id/restore
 * @desc    Restore archived student
 * @access  ADMIN, DIRECTOR, CAMPUS_MANAGER
 * @note    Sets status back to 'active'
 */
router.patch(
  '/:id/restore',
  authorize(['ADMIN', 'DIRECTOR', 'CAMPUS_MANAGER']),
  studentController.restoreStudent
);

/**
 * @route   DELETE /api/students/:id/permanent
 * @desc    Permanently delete student
 * @access  ADMIN only
 * @note    ⚠️ DESTRUCTIVE - Cannot be undone, also deletes profile image
 */
router.delete(
  '/:id/permanent',
  authorize(['ADMIN']),
  studentController.deleteStudentPermanently
);

module.exports = router;