// teacher.router.js
const express = require('express');
const router = express.Router();
const teacherController = require('../controllers/teacher.controller');
const authMiddleware = require('../middleware/auth/auth');

// Public routes
router.post('/login', teacherController.loginTeacher);

//Protected routes - ADMIN and CAMPUS_MANAGER only
router.post('/', 
  authMiddleware(['ADMIN', 'CAMPUS_MANAGER']), 
  teacherController.createTeacher
);

router.patch('/:id', 
  authMiddleware(['ADMIN', 'CAMPUS_MANAGER']), 
  teacherController.updateTeacher
);

router.delete('/:id', 
  authMiddleware(['ADMIN', 'CAMPUS_MANAGER']), 
  teacherController.archiveTeacher
);

router.patch('/:id/restore', 
  authMiddleware(['ADMIN', 'CAMPUS_MANAGER']), 
  teacherController.restoreTeacher
);

// Protected routes - Staff only (multiple roles)
router.get('/', 
  authMiddleware(['ADMIN', 'CAMPUS_MANAGER', 'TEACHER']), 
  teacherController.getAllTeachers
);

// Protected routes - Any authenticated user (teachers can view their own)
router.get('/:id', 
  authMiddleware(), // No specific roles - checks in controller
  teacherController.getOneTeacher
);

router.patch('/:id/password', 
  authMiddleware(), // No specific roles - checks in controller
  teacherController.updateTeacherPassword
);

module.exports = router;