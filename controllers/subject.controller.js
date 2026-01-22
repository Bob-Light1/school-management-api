const Subject = require('../models/subject.model');

/**
 * Create a new subject
 */
exports.createSubject = async (req, res) => {
  try {
    const {
      schoolCampus,
      subject_name,
      subject_code,
      description,
      coefficient,
      color,
    } = req.body;

    const subject = await Subject.create({
      schoolCampus,
      subject_name,
      subject_code,
      description,
      coefficient,
      color,
    });

    return res.status(201).json({
      success: true,
      message: 'Subject created successfully',
      data: subject,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Subject code already exists for this campus',
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Failed to create subject',
      error: error.message,
    });
  }
};

/**
 * Get all subjects (by campus)
 */

exports.getSubjects = async (req, res) => {
  try {
    // ─── Sécurité & droits d'accès ──────────────────────────────
    const user = req.user; // fourni par authMiddleware
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Utilisateur non authentifié',
      });
    }

    // Selon le rôle, limiter les campus visibles
    let allowedCampusIds = [];
    if (user.role === 'CAMPUS_MANAGER') {
      if (!user.campusId) {
        return res.status(403).json({
          success: false,
          message: 'Aucun campus associé à cet utilisateur',
        });
      }
      allowedCampusIds = [user.campusId];
    } else if (user.role === 'TEACHER') {
      // Si teacher, on pourrait limiter aux campus où il enseigne
      // (à implémenter selon ta logique)
      allowedCampusIds = [user.campusId]; // exemple
    }
    // DIRECTOR ou ADMIN voit tout → allowedCampusIds reste vide

    // ─── Paramètres de requête ───────────────────────────────────
    const {
      campusId,
      isActive = 'true',        // par défaut on montre les actifs
      page = 1,
      limit = 50,
      search,
    } = req.query;

    // Convertir proprement isActive (string → boolean)
    const showActive = isActive === 'true' || isActive === true || isActive === '1';

    // Construire le filtre
    const filter = {};

    // Filtre campus (sécurisé)
    if (allowedCampusIds.length > 0) {
      filter.schoolCampus = { $in: allowedCampusIds };
    } else if (campusId) {
      filter.schoolCampus = campusId;
    }

    // Filtre actif/inactif
    filter.isActive = showActive;

    // Recherche texte (optionnel)
    if (search) {
      filter.$or = [
        { subject_name: { $regex: search, $options: 'i' } },
        { subject_code: { $regex: search, $options: 'i' } },
      ];
    }

    // ─── Pagination ──────────────────────────────────────────────
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = Math.min(parseInt(limit, 10) || 50, 100); // max 100
    const skip = (pageNum - 1) * limitNum;

    // ─── Requête ─────────────────────────────────────────────────
    const subjects = await Subject.find(filter)
      .sort({ subject_name: 1 })
      .skip(skip)
      .limit(limitNum)
      .populate('schoolCampus', 'campus_name code location') // plus de champs si besoin
      .lean(); // plus rapide si pas besoin des méthodes mongoose

    const total = await Subject.countDocuments(filter);

    // Réponse structurée et paginée
    return res.status(200).json({
      success: true,
      data: subjects,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum),
        hasNext: pageNum * limitNum < total,
        hasPrev: pageNum > 1,
      },
    });

  } catch (error) {
    console.error('Erreur getSubjects:', error);

    // Ne jamais exposer error.message en prod
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des matières',
      // error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Get subject by ID
 */
exports.getSubjectById = async (req, res) => {
  try {
    const subject = await Subject.findById(req.params.id)
      .populate('schoolCampus', 'campus_name');

    if (!subject) {
      return res.status(404).json({
        success: false,
        message: 'Subject not found',
      });
    }

    return res.status(200).json({
      success: true,
      data: subject,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch subject',
      error: error.message,
    });
  }
};

/**
 * Update subject
 */
exports.updateSubject = async (req, res) => {
  try {
    const updatedSubject = await Subject.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!updatedSubject) {
      return res.status(404).json({
        success: false,
        message: 'Subject not found',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Subject updated successfully',
      data: updatedSubject,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to update subject',
      error: error.message,
    });
  }
};

/**
 * Soft delete (archive) subject
 */
exports.deleteSubject = async (req, res) => {
  try {
    const subject = await Subject.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );

    if (!subject) {
      return res.status(404).json({
        success: false,
        message: 'Subject not found',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Subject archived successfully',
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to delete subject',
      error: error.message,
    });
  }
};

/**
 * Restore archived subject
 */
exports.restoreSubject = async (req, res) => {
  try {
    const subject = await Subject.findByIdAndUpdate(
      req.params.id,
      { isActive: true },
      { new: true }
    );

    if (!subject) {
      return res.status(404).json({
        success: false,
        message: 'Subject not found',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Subject restored successfully',
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to restore subject',
      error: error.message,
    });
  }
};
