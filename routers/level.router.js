const express = require("express");
const {
  createLevel,
  getLevels,
  getLevelById,
  updateLevel,
  deleteLevel,
} = require("../controllers/level.controller");

const { authenticate, authorize } = require("../middleware/auth/auth");

const router = express.Router();

const adminRoles = ["CAMPUS_MANAGER", "DIRECTOR"];
const staffRoles = ["CAMPUS_MANAGER", "DIRECTOR", "TEACHER"];

// Apply authentication to all routes
router.use(authenticate);

/**
 * @route   POST /api/level
 * @desc    Create a new level
 * @access  CAMPUS_MANAGER, DIRECTOR
 */
router.post("/", authorize(adminRoles), createLevel);

/**
 * @route   GET /api/level
 * @desc    Get all levels
 * @access  All authenticated users
 */
router.get("/", getLevels);

/**
 * @route   GET /api/level/:id
 * @desc    Get a level by ID
 * @access  All authenticated users
 */
router.get("/:id", getLevelById);

/**
 * @route   PUT /api/level/update/:id
 * @desc    Update a level
 * @access  CAMPUS_MANAGER, DIRECTOR
 */
router.put("/update/:id", authorize(adminRoles), updateLevel);

/**
 * @route   DELETE /api/level/delete/:id
 * @desc    Delete a level
 * @access  CAMPUS_MANAGER, DIRECTOR
 */
router.delete("/delete/:id", authorize(adminRoles), deleteLevel);

module.exports = router;