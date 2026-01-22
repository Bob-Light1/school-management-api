// student.router.js
const express = require('express');
const router = express.Router();
const studentController = require('../controllers/student.controller');
const authMiddleware = require('../middleware/auth/auth');

// Public routes
router.post('/login', studentController.loginStudent);

//Protected routes - ADMIN and CAMPUS_MANAGER only
router.post('/', 
  authMiddleware(['ADMIN', 'CAMPUS_MANAGER']), 
  studentController.createStudent
);

router.patch('/:id', 
  authMiddleware(['ADMIN', 'CAMPUS_MANAGER']), 
  studentController.updateStudent
);

router.delete('/:id', 
  authMiddleware(['ADMIN', 'CAMPUS_MANAGER']), 
  studentController.archiveStudent
);

router.patch('/:id/restore', 
  authMiddleware(['ADMIN', 'CAMPUS_MANAGER']), 
  studentController.restoreStudent
);

// Protected routes - Staff only (multiple roles)
router.get('/', 
  authMiddleware(['ADMIN', 'CAMPUS_MANAGER', 'TEACHER']), 
  studentController.getAllStudents
);

// Protected routes - Any authenticated user (students can view their own)
router.get('/:id', 
  authMiddleware(), // No specific roles - checks in controller
  studentController.getOneStudent
);

router.patch('/:id/password', 
  authMiddleware(), // No specific roles - checks in controller
  studentController.updateStudentPassword
);

module.exports = router;