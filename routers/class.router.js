const express = require("express");
const authMiddleware = require('../middleware/auth/auth');
const {
    createClass,
    getAllClass,
    getClassById,
    updateClass,
    getClassesByCampus,
    getClassesByTeacher,
    deleteClass,
    restoreClass
} = require('../controllers/class.controller');

const router = express.Router();

/**
 * Authorized roles for reading: CAMPUS_MANAGER, DIRECTOR, TEACHER
 * Authorized roles for modification: CAMPUS_MANAGER, DIRECTOR
 */

const staffRoles = ['CAMPUS_MANAGER', 'DIRECTOR', 'TEACHER'];
const adminRoles = ['CAMPUS_MANAGER', 'DIRECTOR'];

// --- GENERAL CREATION AND READING ROUTES ---

// Create a new class
router.post("/", authMiddleware(adminRoles), createClass);

// Get all classes (with filters and pagination)
router.get("/", authMiddleware(staffRoles), getAllClass);

// --- SPECIFIC SEARCH ROUTES ---

// Get a class by its unique ID
router.get("/single/:id", authMiddleware(staffRoles), getClassById);

// Get classes from a specific campus
router.get("/campus/:campusId", authMiddleware(staffRoles), getClassesByCampus);

// Get classes managed by a specific teacher
router.get("/teacher/:teacherId", authMiddleware(staffRoles), getClassesByTeacher);

// --- MODIFICATION AND DELETION ROUTES ---

// Update class information
router.put("/:id", authMiddleware(adminRoles), updateClass);

// Archive a class (Soft Delete)
router.delete("/:id", authMiddleware(adminRoles), deleteClass);

// Restore an archived class
router.patch("/:id/restore", authMiddleware(adminRoles), restoreClass);

module.exports = router;