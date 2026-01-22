const express = require('express');
const authMiddleware = require('../middleware/auth/auth');
const {
  createSubject,
  getSubjects,
  getSubjectById,
  updateSubject,
  deleteSubject,
  restoreSubject
} = require('../controllers/subject.controller');

const router = express.Router();

/**
 * Roles autorisés pour la lecture : CAMPUS_MANAGER, DIRECTOR, TEACHER, ADMIN
 * Roles autorisés pour la modification : CAMPUS_MANAGER, DIRECTOR, ADMIN
 */

const staffRoles = ['ADMIN', 'DIRECTOR', 'CAMPUS_MANAGER', 'TEACHER'];
const adminRoles = ['ADMIN', 'DIRECTOR', 'CAMPUS_MANAGER'];

// --- ROUTES DE CRÉATION ET LECTURE GÉNÉRALE ---

// Créer une nouvelle matière
router.post("/", authMiddleware(adminRoles), createSubject);

// Récupérer toutes les matières
router.get("/", authMiddleware(staffRoles), getSubjects);

// --- ROUTES DE RECHERCHE SPÉCIFIQUE ---

// Récupérer une matière par son ID unique
router.get("/:id", authMiddleware(staffRoles), getSubjectById);

// --- ROUTES DE MODIFICATION ET SUPPRESSION ---

// Mettre à jour les informations d'une matière
router.put("/:id", authMiddleware(adminRoles), updateSubject);

// Archiver une matière (Soft Delete)
router.delete("/:id", authMiddleware(adminRoles), deleteSubject);

// Restaurer une matière archivée
router.patch("/:id/restore", authMiddleware(adminRoles), restoreSubject);

module.exports = router;