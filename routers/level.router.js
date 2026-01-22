const express = require("express");
const {
  createLevel,
  getLevels,
  getLevelById,
  updateLevel,
  deleteLevel,
} = require("../controllers/level.controller");

const auth = require("../middleware/auth/auth");

const router = express.Router();

const adminRoles = ["CAMPUS_MANAGER", "DIRECTOR"];

router.post("/", auth(adminRoles), createLevel);
router.get("/", auth(), getLevels);
router.get("/:id", auth(), getLevelById);
router.put("/update/:id", auth(adminRoles), updateLevel);
router.delete("/delete/:id", auth(adminRoles), deleteLevel);

module.exports = router;
