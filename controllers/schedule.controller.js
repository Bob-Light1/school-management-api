'use strict';

/**
 * @file result.controller.js
 * @description Controller Express pour la gestion des résultats académiques.
 *
 *  Alignements foruni :
 *  ─────────────────────
 *  • JWT payload : req.user.id, req.user.role, req.user.campusId
 *  • Helpers     : sendSuccess, sendError, sendPaginated, asyncHandler
 *                  depuis '../utils/responseHelpers'
 *  • Validation  : isValidObjectId, buildCampusFilter, validateStudentBelongsToCampus
 *                  depuis '../utils/validationHelpers'
 *
 *  Hiérarchie des rôles :
 *  ─────────────────────────────────────────────────────────────────
 *  ADMIN / DIRECTOR     → accès cross-campus, peut outrepasser les verrous
 *  CAMPUS_MANAGER       → validation/publication, bulletins, analytics campus
 *  TEACHER              → saisie, soumission, stats de sa classe
 *  STUDENT              → lecture de ses propres notes publiées
 *
 *  Routes exposées (enregistrées dans result.router.js) :
 *  ─────────────────────────────────────────────────────────────────
 *  POST   /api/results                              → createResult
 *  POST   /api/results/bulk                         → bulkCreateResults
 *  POST   /api/results/upload-csv                   → uploadResultsCSV
 *  GET    /api/results                              → getResults
 *  GET    /api/results/:id                          → getResultById
 *  PUT    /api/results/:id                          → updateResult
 *  DELETE /api/results/:id                          → deleteResult
 *
 *  POST   /api/results/:id/submit                   → submitResults
 *  POST   /api/results/submit-batch                 → submitBatch
 *  PATCH  /api/results/:id/publish                  → publishResult
 *  PATCH  /api/results/publish-batch                → publishBatch
 *  PATCH  /api/results/:id/archive                  → archiveResult
 *  PATCH  /api/results/lock-semester                → lockSemester
 *  PATCH  /api/results/audit/:id                    → auditCorrection
 *
 *  GET    /api/results/transcript/:studentId        → getTranscript
 *  GET    /api/results/statistics/:classId          → getClassStatistics
 *  GET    /api/results/retake-list/:classId         → getRetakeList
 *  GET    /api/results/campus/overview              → getCampusOverview
 *  GET    /api/results/verify/:token                → verifyResult (public)
 *
 *  GET    /api/results/grading-scales               → listGradingScales
 *  POST   /api/results/grading-scales               → createGradingScale
 *  PATCH  /api/results/grading-scales/:id           → updateGradingScale
 */

const mongoose = require('mongoose');
const { parse: csvParse } = require('csv-parse/sync');

const { Result, RESULT_STATUS, EVALUATION_TYPE, SEMESTER } = require('../models/result.model');
const { GradingScale, GRADING_SYSTEM }                     = require('../models/gradingScale.model');
const Student = require('../models/student.model');
const Subject = require('../models/subject.model');
const Class   = require('../models/class.model');

const {
  asyncHandler,
  sendSuccess,
  sendError,
  sendCreated,
  sendPaginated,
  sendNotFound,
  sendForbidden,
  handleDuplicateKeyError,
} = require('../utils/responseHelpers');

const {
  isValidObjectId,
  buildCampusFilter,
  validateStudentBelongsToCampus,
} = require('../utils/validationHelpers');

// ─── HELPERS INTERNES ─────────────────────────────────────────────────────────

const isGlobalRole  = (role) => role === 'ADMIN' || role === 'DIRECTOR';
const isManagerRole = (role) => isGlobalRole(role) || role === 'CAMPUS_MANAGER';

const parsePositiveInt = (val, fallback) => {
  const n = parseInt(val, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/**
 * Retourne le filtre de campus issu de buildCampusFilter (foruni validationHelpers)
 * en adaptant la signature pour req.
 */
const getCampusFilter = (req) =>
  buildCampusFilter(req.user, req.query.campusId || null);

/**
 * Vérifie qu'un enseignant peut modifier ce résultat.
 * Un TEACHER ne peut toucher que ses propres résultats en DRAFT.
 */
const assertTeacherOwnership = (result, userId, role) => {
  if (isManagerRole(role)) return;  // managers ont accès total
  if (result.teacher.toString() !== userId) return false;
  return true;
};

// ─── GESTION DES RÉSULTATS (CRUD) ─────────────────────────────────────────────

/**
 * POST /api/results
 * Crée un résultat individuel (statut DRAFT).
 *
 * Body : { student, class, subject, teacher, score, maxScore, coefficient?,
 *           evaluationType, evaluationTitle, academicYear, semester,
 *           comment?, gradingScale?, schoolCampus? }
 */
const createResult = asyncHandler(async (req, res) => {
  const {
    student, class: classId, subject, teacher,
    score, maxScore, coefficient,
    evaluationType, evaluationTitle,
    academicYear, semester,
    comment, gradingScale,
    schoolCampus: campusFromBody,
  } = req.body;

  // ── Résolution du campus ─────────────────
  const { role, campusId: userCampusId } = req.user;
  const resolvedCampus = isGlobalRole(role) ? (campusFromBody || userCampusId) : userCampusId;

  if (!resolvedCampus) return sendError(res, 400, 'schoolCampus is required.');

  // ── Validation des champs obligatoires ───
  const required = { student, class: classId, subject, teacher, score, maxScore, evaluationType, evaluationTitle, academicYear, semester };
  for (const [field, val] of Object.entries(required)) {
    if (val == null || val === '') return sendError(res, 400, `${field} is required.`);
  }

  if (!isValidObjectId(student))  return sendError(res, 400, 'Invalid student ID.');
  if (!isValidObjectId(classId))  return sendError(res, 400, 'Invalid class ID.');
  if (!isValidObjectId(subject))  return sendError(res, 400, 'Invalid subject ID.');
  if (!isValidObjectId(teacher))  return sendError(res, 400, 'Invalid teacher ID.');
  if (!Object.values(EVALUATION_TYPE).includes(evaluationType))
    return sendError(res, 400, `Invalid evaluationType. Must be: ${Object.values(EVALUATION_TYPE).join(', ')}`);
  if (!Object.values(SEMESTER).includes(semester))
    return sendError(res, 400, `Invalid semester. Must be: ${Object.values(SEMESTER).join(', ')}`);
  if (!/^\d{4}-\d{4}$/.test(academicYear))
    return sendError(res, 400, 'academicYear must be YYYY-YYYY.');
  if (Number(score) < 0 || Number(score) > Number(maxScore))
    return sendError(res, 400, `Score must be between 0 and maxScore (${maxScore}).`);

  // ── Campus isolation : l'étudiant appartient-il au campus ? ─
  if (!isGlobalRole(role)) {
    const belongs = await validateStudentBelongsToCampus(student, resolvedCampus);
    if (!belongs) return sendForbidden(res, 'Student does not belong to your campus.');
  }

  try {
    const result = await Result.create({
      student, class: classId, subject, teacher,
      score: Number(score), maxScore: Number(maxScore),
      coefficient: coefficient != null ? Number(coefficient) : 1,
      evaluationType, evaluationTitle,
      academicYear, semester, comment,
      gradingScale: gradingScale || null,
      schoolCampus: resolvedCampus,
      status: RESULT_STATUS.DRAFT,
    });

    return sendCreated(res, 'Result created as DRAFT.', result);
  } catch (err) {
    if (err.code === 11000) return handleDuplicateKeyError(res, err);
    throw err;
  }
});

/**
 * POST /api/results/bulk
 * Saisie massive pour une classe entière (tableau de notes).
 *
 * Body : {
 *   classId, subjectId, teacherId, evaluationType, evaluationTitle,
 *   academicYear, semester, maxScore, gradingScale?,
 *   results: [{ studentId, score, comment?, coefficient? }]
 * }
 */
const bulkCreateResults = asyncHandler(async (req, res) => {
  const {
    classId, subjectId, teacherId,
    evaluationType, evaluationTitle,
    academicYear, semester, maxScore,
    gradingScale,
    results: entries = [],
  } = req.body;

  const { role, campusId: userCampusId } = req.user;
  const resolvedCampus = isGlobalRole(role)
    ? (req.body.schoolCampus || userCampusId)
    : userCampusId;

  if (!resolvedCampus)       return sendError(res, 400, 'schoolCampus is required.');
  if (!isValidObjectId(classId))   return sendError(res, 400, 'Invalid classId.');
  if (!isValidObjectId(subjectId)) return sendError(res, 400, 'Invalid subjectId.');
  if (!isValidObjectId(teacherId)) return sendError(res, 400, 'Invalid teacherId.');
  if (!Array.isArray(entries) || !entries.length)
    return sendError(res, 400, 'results[] must be a non-empty array.');
  if (!Object.values(EVALUATION_TYPE).includes(evaluationType))
    return sendError(res, 400, 'Invalid evaluationType.');
  if (!Object.values(SEMESTER).includes(semester))
    return sendError(res, 400, 'Invalid semester.');
  if (!/^\d{4}-\d{4}$/.test(academicYear))
    return sendError(res, 400, 'academicYear must be YYYY-YYYY.');
  if (!maxScore || Number(maxScore) < 1)
    return sendError(res, 400, 'maxScore must be at least 1.');

  // Vérification que la classe appartient au campus
  const classDoc = await Class.findById(classId).select('schoolCampus students').lean();
  if (!classDoc) return sendNotFound(res, 'Class');
  if (!isGlobalRole(role) && classDoc.schoolCampus.toString() !== resolvedCampus.toString())
    return sendForbidden(res, 'Class does not belong to your campus.');

  const enrolledIds = new Set(classDoc.students.map((s) => s.toString()));
  const errors      = [];
  const toInsert    = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const { studentId, score, comment: entryComment, coefficient: entryCoeff } = entry;

    if (!isValidObjectId(studentId)) {
      errors.push({ index: i, studentId, error: 'Invalid studentId.' }); continue;
    }
    if (!enrolledIds.has(studentId.toString())) {
      errors.push({ index: i, studentId, error: 'Student not enrolled in this class.' }); continue;
    }
    const s = Number(score);
    if (!Number.isFinite(s) || s < 0 || s > Number(maxScore)) {
      errors.push({ index: i, studentId, error: `Score must be 0–${maxScore}.` }); continue;
    }

    toInsert.push({
      student:         studentId,
      class:           classId,
      subject:         subjectId,
      teacher:         teacherId,
      score:           s,
      maxScore:        Number(maxScore),
      coefficient:     entryCoeff != null ? Number(entryCoeff) : 1,
      evaluationType,
      evaluationTitle,
      academicYear,
      semester,
      comment:         entryComment || null,
      gradingScale:    gradingScale || null,
      schoolCampus:    resolvedCampus,
      status:          RESULT_STATUS.DRAFT,
    });
  }

  if (!toInsert.length) {
    return sendError(res, 400, 'No valid entries to insert.', errors);
  }

  // insertMany avec ordered:false pour insérer le maximum même si certains sont en doublon
  let inserted = [];
  let duplicates = [];
  try {
    inserted = await Result.insertMany(toInsert, { ordered: false });
  } catch (err) {
    if (err.code === 11000 || err.name === 'BulkWriteError') {
      inserted  = err.insertedDocs  || [];
      duplicates = (err.writeErrors || []).map((e) => ({
        index:     e.index,
        studentId: toInsert[e.index]?.student,
        error:     'Duplicate result for this evaluation.',
      }));
    } else {
      throw err;
    }
  }

  return sendSuccess(res, 207, 'Bulk create completed.', {
    inserted:   inserted.length,
    skipped:    errors.length + duplicates.length,
    errors:     [...errors, ...duplicates],
  });
});

/**
 * POST /api/results/upload-csv
 * Import massif via CSV. Colonnes attendues :
 *   studentId, score, comment (optionnel), coefficient (optionnel)
 *
 * Form-data : file (CSV), + mêmes champs contexte que bulkCreate
 */
const uploadResultsCSV = asyncHandler(async (req, res) => {
  if (!req.file) return sendError(res, 400, 'No CSV file uploaded.');

  let rows;
  try {
    rows = csvParse(req.file.buffer.toString('utf-8'), {
      columns:          true,
      skip_empty_lines: true,
      trim:             true,
    });
  } catch (err) {
    return sendError(res, 400, `CSV parsing error: ${err.message}`);
  }

  if (!rows.length) return sendError(res, 400, 'CSV file is empty.');

  // On réutilise la logique bulkCreate en injectant les rows dans req.body.results
  req.body.results = rows.map((row) => ({
    studentId:   row.studentId || row.student_id,
    score:       Number(row.score),
    comment:     row.comment   || null,
    coefficient: row.coefficient ? Number(row.coefficient) : undefined,
  }));

  return bulkCreateResults(req, res);
});

/**
 * GET /api/results
 * Liste paginée des résultats avec filtres multidimensionnels.
 *
 * Query : classId?, subjectId?, teacherId?, studentId?, status?,
 *         evaluationType?, academicYear?, semester?,
 *         campusId? (ADMIN/DIRECTOR), page, limit
 */
const getResults = asyncHandler(async (req, res) => {
  const {
    classId, subjectId, teacherId, studentId,
    status, evaluationType, academicYear, semester,
    page = 1, limit = 50,
  } = req.query;

  const filter = {
    isDeleted: false,
    ...getCampusFilter(req),
  };

  if (classId   && isValidObjectId(classId))   filter.class   = classId;
  if (subjectId && isValidObjectId(subjectId)) filter.subject = subjectId;
  if (teacherId && isValidObjectId(teacherId)) filter.teacher = teacherId;
  if (studentId && isValidObjectId(studentId)) filter.student = studentId;
  if (status    && Object.values(RESULT_STATUS).includes(status))     filter.status = status;
  if (evaluationType && Object.values(EVALUATION_TYPE).includes(evaluationType))
    filter.evaluationType = evaluationType;
  if (academicYear) filter.academicYear = academicYear;
  if (semester && Object.values(SEMESTER).includes(semester)) filter.semester = semester;

  // Les STUDENTs ne voient que les notes publiées/archivées
  if (req.user.role === 'STUDENT') {
    filter.student = req.user.id;
    filter.status  = { $in: [RESULT_STATUS.PUBLISHED, RESULT_STATUS.ARCHIVED] };
  }

  const pageNum  = parsePositiveInt(page, 1);
  const limitNum = parsePositiveInt(limit, 50);

  const [results, total] = await Promise.all([
    Result.find(filter)
      .populate('student', 'firstName lastName matricule')
      .populate('subject', 'subject_name subject_code coefficient')
      .populate('teacher', 'firstName lastName email')
      .populate('class',   'className')
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean(),
    Result.countDocuments(filter),
  ]);

  return sendPaginated(res, 200, 'Results fetched.', results, { total, page: pageNum, limit: limitNum });
});

/**
 * GET /api/results/:id
 * Détail d'un résultat avec audit log complet.
 */
const getResultById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) return sendError(res, 400, 'Invalid result ID.');

  const result = await Result.findOne({ _id: id, isDeleted: false })
    .populate('student', 'firstName lastName matricule email')
    .populate('subject', 'subject_name subject_code coefficient')
    .populate('teacher', 'firstName lastName email')
    .populate('class',   'className')
    .populate('gradingScale', 'name system maxScore passMark bands')
    .lean();

  if (!result) return sendNotFound(res, 'Result');

  // Isolation : un étudiant ne peut voir que ses propres notes publiées
  if (req.user.role === 'STUDENT') {
    if (result.student._id.toString() !== req.user.id)
      return sendForbidden(res, 'Access denied.');
    if (![RESULT_STATUS.PUBLISHED, RESULT_STATUS.ARCHIVED].includes(result.status))
      return sendError(res, 404, 'Result not found or not yet published.');
  }

  // Campus isolation pour les rôles non-globaux
  if (!isGlobalRole(req.user.role) && result.schoolCampus.toString() !== req.user.campusId.toString())
    return sendForbidden(res, 'Access denied.');

  return sendSuccess(res, 200, 'Result fetched.', result);
});

/**
 * PUT /api/results/:id
 * Met à jour un résultat en DRAFT (enseignant propriétaire ou manager).
 * Un résultat PUBLISHED/ARCHIVED ne peut être modifié que via auditCorrection.
 */
const updateResult = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) return sendError(res, 400, 'Invalid result ID.');

  const result = await Result.findOne({ _id: id, isDeleted: false });
  if (!result) return sendNotFound(res, 'Result');

  if (!isGlobalRole(req.user.role) && result.schoolCampus.toString() !== req.user.campusId?.toString())
    return sendForbidden(res, 'Access denied.');

  if (result.status !== RESULT_STATUS.DRAFT && !isManagerRole(req.user.role))
    return sendError(res, 400, 'Only DRAFT results can be updated. Use the audit endpoint for published results.');

  if (result.periodLocked && !isGlobalRole(req.user.role))
    return sendError(res, 403, 'This semester is locked. Contact an administrator.');

  if (req.user.role === 'TEACHER' && result.teacher.toString() !== req.user.id)
    return sendForbidden(res, 'You can only update your own results.');

  const allowed = ['score', 'maxScore', 'coefficient', 'comment', 'gradingScale', 'evaluationTitle'];
  allowed.forEach((field) => {
    if (req.body[field] !== undefined) result[field] = req.body[field];
  });

  await result.save();
  return sendSuccess(res, 200, 'Result updated.', result);
});

/**
 * DELETE /api/results/:id
 * Soft-delete d'un résultat (DRAFT uniquement sauf ADMIN).
 */
const deleteResult = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) return sendError(res, 400, 'Invalid result ID.');

  const result = await Result.findOne({ _id: id, isDeleted: false });
  if (!result) return sendNotFound(res, 'Result');

  if (!isGlobalRole(req.user.role) && result.schoolCampus.toString() !== req.user.campusId?.toString())
    return sendForbidden(res, 'Access denied.');

  if (result.status !== RESULT_STATUS.DRAFT && !isGlobalRole(req.user.role))
    return sendError(res, 400, 'Only DRAFT results can be deleted.');

  if (result.periodLocked && !isGlobalRole(req.user.role))
    return sendError(res, 403, 'This semester is locked.');

  result.isDeleted = true;
  result.deletedAt = new Date();
  result.deletedBy = req.user.id;
  await result.save();

  return sendSuccess(res, 200, 'Result deleted.', { _id: result._id });
});

// ─── WORKFLOW D'ÉTAT ──────────────────────────────────────────────────────────

/**
 * POST /api/results/:id/submit
 * L'enseignant soumet un résultat individuel DRAFT → SUBMITTED.
 */
const submitResult = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) return sendError(res, 400, 'Invalid result ID.');

  const result = await Result.findOne({ _id: id, isDeleted: false });
  if (!result) return sendNotFound(res, 'Result');

  if (result.status !== RESULT_STATUS.DRAFT)
    return sendError(res, 400, `Cannot submit a result in status '${result.status}'.`);

  if (req.user.role === 'TEACHER' && result.teacher.toString() !== req.user.id)
    return sendForbidden(res, 'You can only submit your own results.');

  result.status      = RESULT_STATUS.SUBMITTED;
  result.submittedAt = new Date();
  result.submittedBy = req.user.id;
  await result.save();

  return sendSuccess(res, 200, 'Result submitted for review.', result);
});

/**
 * POST /api/results/submit-batch
 * Soumet en lot tous les DRAFT d'une évaluation → SUBMITTED.
 *
 * Body : { classId, subjectId, evaluationTitle, academicYear, semester }
 */
const submitBatch = asyncHandler(async (req, res) => {
  const { classId, subjectId, evaluationTitle, academicYear, semester } = req.body;

  if (!isValidObjectId(classId))   return sendError(res, 400, 'Invalid classId.');
  if (!isValidObjectId(subjectId)) return sendError(res, 400, 'Invalid subjectId.');
  if (!evaluationTitle || !academicYear || !semester)
    return sendError(res, 400, 'evaluationTitle, academicYear and semester are required.');

  const campusFilter = getCampusFilter(req);

  const filter = {
    class:           classId,
    subject:         subjectId,
    evaluationTitle,
    academicYear,
    semester,
    status:          RESULT_STATUS.DRAFT,
    isDeleted:       false,
    ...campusFilter,
  };

  // TEACHER ne peut soumettre que ses propres résultats
  if (req.user.role === 'TEACHER') filter.teacher = req.user.id;

  const { modifiedCount } = await Result.updateMany(filter, {
    $set: { status: RESULT_STATUS.SUBMITTED, submittedAt: new Date(), submittedBy: req.user.id },
  });

  return sendSuccess(res, 200, `${modifiedCount} result(s) submitted for review.`, { modifiedCount });
});

/**
 * PATCH /api/results/:id/publish
 * Le Campus Manager publie un résultat SUBMITTED → PUBLISHED.
 * Calcule et met à jour la moyenne générale de l'étudiant en fire-and-forget.
 */
const publishResult = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) return sendError(res, 400, 'Invalid result ID.');

  const result = await Result.findOne({ _id: id, isDeleted: false });
  if (!result) return sendNotFound(res, 'Result');

  if (!isManagerRole(req.user.role)) return sendForbidden(res, 'Only Campus Managers or Admins can publish results.');

  if (!isGlobalRole(req.user.role) && result.schoolCampus.toString() !== req.user.campusId?.toString())
    return sendForbidden(res, 'Access denied.');

  if (result.status !== RESULT_STATUS.SUBMITTED)
    return sendError(res, 400, `Result must be SUBMITTED before publishing. Current status: ${result.status}`);

  result.status      = RESULT_STATUS.PUBLISHED;
  result.publishedBy = req.user.id;
  // publishedAt et verificationToken sont générés en pre-save
  await result.save();

  // Calcul asynchrone du risque de décrochage (fire-and-forget)
  Result.computeDropoutRisk(result.student, result.schoolCampus)
    .then((risk) => Result.updateOne({ _id: result._id }, { $set: { dropoutRiskScore: risk } }))
    .catch((err) => console.error('[DropoutRisk] computation failed:', err.message));

  return sendSuccess(res, 200, 'Result published. Student can now view this result.', result);
});

/**
 * PATCH /api/results/publish-batch
 * Publication en lot : tous les SUBMITTED d'une évaluation → PUBLISHED.
 *
 * Body : { classId, subjectId, evaluationTitle, academicYear, semester }
 */
const publishBatch = asyncHandler(async (req, res) => {
  const { classId, subjectId, evaluationTitle, academicYear, semester } = req.body;

  if (!isValidObjectId(classId))   return sendError(res, 400, 'Invalid classId.');
  if (!isValidObjectId(subjectId)) return sendError(res, 400, 'Invalid subjectId.');

  if (!isManagerRole(req.user.role)) return sendForbidden(res, 'Only managers can publish results.');

  const campusFilter = getCampusFilter(req);

  const filter = {
    class:           classId,
    subject:         subjectId,
    evaluationTitle,
    academicYear,
    semester,
    status:          RESULT_STATUS.SUBMITTED,
    isDeleted:       false,
    ...campusFilter,
  };

  const { randomUUID } = require('crypto');
  const now = new Date();

  // On doit itérer pour déclencher le pre-save (verificationToken + gradeBand)
  const toPublish = await Result.find(filter);

  await Promise.all(
    toPublish.map((r) => {
      r.status      = RESULT_STATUS.PUBLISHED;
      r.publishedAt = now;
      r.publishedBy = req.user.id;
      if (!r.verificationToken) r.verificationToken = randomUUID();
      return r.save();
    })
  );

  return sendSuccess(res, 200, `${toPublish.length} result(s) published.`, {
    published: toPublish.length,
  });
});

/**
 * PATCH /api/results/:id/archive
 * Archive un résultat PUBLISHED → ARCHIVED (fin de semestre).
 */
const archiveResult = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) return sendError(res, 400, 'Invalid result ID.');

  const result = await Result.findOne({ _id: id, isDeleted: false });
  if (!result) return sendNotFound(res, 'Result');

  if (!isManagerRole(req.user.role)) return sendForbidden(res, 'Only managers can archive results.');

  if (result.status !== RESULT_STATUS.PUBLISHED)
    return sendError(res, 400, 'Only PUBLISHED results can be archived.');

  result.status     = RESULT_STATUS.ARCHIVED;
  result.archivedBy = req.user.id;
  await result.save();

  return sendSuccess(res, 200, 'Result archived.', result);
});

/**
 * PATCH /api/results/lock-semester
 * Clôture un semestre : verrouille tous les résultats PUBLISHED et ARCHIVED.
 * CAMPUS_MANAGER uniquement — nécessite ADMIN pour déverrouiller.
 *
 * Body : { academicYear, semester, schoolCampus? }
 */
const lockSemester = asyncHandler(async (req, res) => {
  const { academicYear, semester } = req.body;

  if (!isManagerRole(req.user.role)) return sendForbidden(res, 'Only managers can lock a semester.');
  if (!academicYear || !semester)    return sendError(res, 400, 'academicYear and semester are required.');
  if (!Object.values(SEMESTER).includes(semester)) return sendError(res, 400, 'Invalid semester.');

  const campusFilter = getCampusFilter(req);

  const { modifiedCount } = await Result.updateMany(
    {
      academicYear,
      semester,
      status:    { $in: [RESULT_STATUS.PUBLISHED, RESULT_STATUS.ARCHIVED] },
      isDeleted: false,
      ...campusFilter,
    },
    { $set: { periodLocked: true } }
  );

  return sendSuccess(res, 200, `Semester ${semester} ${academicYear} locked. ${modifiedCount} result(s) locked.`, {
    modifiedCount,
  });
});

/**
 * PATCH /api/results/audit/:id
 * Correction post-publication d'une note. Réservée ADMIN/DIRECTOR.
 * Toute modification est tracée dans auditLog[].
 *
 * Body : { score?, comment?, reason (min 10 chars) }
 */
const auditCorrection = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { score, comment, reason } = req.body;

  if (!isValidObjectId(id)) return sendError(res, 400, 'Invalid result ID.');
  if (!isGlobalRole(req.user.role)) return sendForbidden(res, 'Only ADMIN or DIRECTOR can make post-publication corrections.');
  if (!reason || reason.trim().length < 10)
    return sendError(res, 400, 'A reason with at least 10 characters is required.');

  const result = await Result.findOne({ _id: id, isDeleted: false });
  if (!result) return sendNotFound(res, 'Result');

  if (result.status === RESULT_STATUS.DRAFT)
    return sendError(res, 400, 'Use the standard update endpoint for DRAFT results.');

  if (score !== undefined) {
    if (Number(score) < 0 || Number(score) > result.maxScore)
      return sendError(res, 400, `Score must be between 0 and ${result.maxScore}.`);
    result.addAuditEntry('score', result.score, Number(score), reason.trim(), req.user.id, req.ip);
    result.score = Number(score);
  }

  if (comment !== undefined) {
    result.addAuditEntry('comment', result.comment, comment, reason.trim(), req.user.id, req.ip);
    result.comment = comment;
  }

  await result.save();

  return sendSuccess(res, 200, 'Audit correction applied and logged.', result);
});

// ─── ANALYTICS & RAPPORTS ─────────────────────────────────────────────────────

/**
 * GET /api/results/transcript/:studentId
 * Relevé de notes complet d'un étudiant (toutes matières, tous semestres).
 * Inclut moyenne par matière, moyenne générale, gradeBand, ECTS.
 *
 * Query : academicYear? (filtre par année si fourni)
 */
const getTranscript = asyncHandler(async (req, res) => {
  const { studentId } = req.params;
  const { academicYear } = req.query;

  if (!isValidObjectId(studentId)) return sendError(res, 400, 'Invalid student ID.');

  // Campus isolation
  if (req.user.role === 'STUDENT' && studentId !== req.user.id)
    return sendForbidden(res, 'Access denied.');

  const student = await Student.findById(studentId)
    .select('firstName lastName matricule email schoolCampus studentClass')
    .lean();
  if (!student) return sendNotFound(res, 'Student');

  if (!isGlobalRole(req.user.role) && student.schoolCampus.toString() !== req.user.campusId?.toString())
    return sendForbidden(res, 'Access denied.');

  const matchFilter = {
    student:   new mongoose.Types.ObjectId(studentId),
    status:    { $in: [RESULT_STATUS.PUBLISHED, RESULT_STATUS.ARCHIVED] },
    isDeleted: false,
    retakeOf:  null,
  };
  if (academicYear) matchFilter.academicYear = academicYear;

  const pipeline = [
    { $match: matchFilter },
    {
      $group: {
        _id: { academicYear: '$academicYear', semester: '$semester', subject: '$subject' },
        evaluations: {
          $push: {
            evaluationType:  '$evaluationType',
            evaluationTitle: '$evaluationTitle',
            score:           '$score',
            maxScore:        '$maxScore',
            normalizedScore: '$normalizedScore',
            coefficient:     '$coefficient',
            gradeBand:       '$gradeBand',
            comment:         '$comment',
          },
        },
        // Moyenne pondérée de la matière
        subjectAvg: {
          $avg: { $multiply: [{ $divide: ['$score', '$maxScore'] }, 20] },
        },
        subjectCoeff: { $first: '$coefficient' },
      },
    },
    {
      $lookup: {
        from: 'subjects', localField: '_id.subject', foreignField: '_id', as: 'subjectDoc',
      },
    },
    { $unwind: { path: '$subjectDoc', preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id:          { academicYear: '$_id.academicYear', semester: '$_id.semester' },
        subjects: {
          $push: {
            subjectId:   '$_id.subject',
            subjectName: '$subjectDoc.subject_name',
            subjectCode: '$subjectDoc.subject_code',
            coefficient: { $ifNull: ['$subjectDoc.coefficient', '$subjectCoeff'] },
            average:     { $round: ['$subjectAvg', 2] },
            evaluations: '$evaluations',
          },
        },
      },
    },
    { $sort: { '_id.academicYear': -1, '_id.semester': 1 } },
  ];

  const semesters = await Result.aggregate(pipeline);

  // Calcul de la moyenne générale par semestre
  const enriched = semesters.map((sem) => {
    let wSum = 0, wTotal = 0;
    for (const s of sem.subjects) {
      wSum   += (s.average || 0) * (s.coefficient || 1);
      wTotal += s.coefficient || 1;
    }
    return {
      academicYear:   sem._id.academicYear,
      semester:       sem._id.semester,
      generalAverage: wTotal > 0 ? parseFloat((wSum / wTotal).toFixed(2)) : null,
      subjects:       sem.subjects,
    };
  });

  return sendSuccess(res, 200, 'Transcript fetched.', {
    student: {
      _id:       student._id,
      firstName: student.firstName,
      lastName:  student.lastName,
      matricule: student.matricule,
      email:     student.email,
    },
    semesters: enriched,
    verificationUrl: `${process.env.APP_URL || ''}/api/results/verify`,
  });
});

/**
 * GET /api/results/statistics/:classId
 * Distribution statistique des notes d'une évaluation pour une classe.
 * Utilisé par l'enseignant pour visualiser sa classe avant soumission.
 *
 * Query : subjectId, evaluationTitle, academicYear, semester
 */
const getClassStatistics = asyncHandler(async (req, res) => {
  const { classId } = req.params;
  const { subjectId, evaluationTitle, academicYear, semester } = req.query;

  if (!isValidObjectId(classId))   return sendError(res, 400, 'Invalid classId.');
  if (!isValidObjectId(subjectId)) return sendError(res, 400, 'subjectId is required.');
  if (!evaluationTitle)            return sendError(res, 400, 'evaluationTitle is required.');
  if (!academicYear || !semester)  return sendError(res, 400, 'academicYear and semester are required.');

  const stats = await Result.getClassDistribution(classId, subjectId, evaluationTitle, academicYear, semester);
  if (!stats) return sendError(res, 404, 'No results found for this evaluation.');

  return sendSuccess(res, 200, 'Class statistics fetched.', stats);
});

/**
 * GET /api/results/retake-list/:classId
 * Liste des étudiants éligibles au rattrapage dans une classe.
 * Filtrés par matière si subjectId est fourni.
 *
 * Query : subjectId?, academicYear, semester
 */
const getRetakeList = asyncHandler(async (req, res) => {
  const { classId } = req.params;
  const { subjectId, academicYear, semester } = req.query;

  if (!isValidObjectId(classId)) return sendError(res, 400, 'Invalid classId.');
  if (!academicYear || !semester) return sendError(res, 400, 'academicYear and semester are required.');

  if (!isManagerRole(req.user.role) && req.user.role !== 'TEACHER')
    return sendForbidden(res, 'Access denied.');

  const filter = {
    class:            classId,
    academicYear,
    semester,
    isRetakeEligible: true,
    status:           { $in: [RESULT_STATUS.PUBLISHED, RESULT_STATUS.ARCHIVED] },
    isDeleted:        false,
    retakeOf:         null,
    ...getCampusFilter(req),
  };
  if (subjectId && isValidObjectId(subjectId)) filter.subject = subjectId;

  const retakes = await Result.find(filter)
    .populate('student', 'firstName lastName matricule email')
    .populate('subject', 'subject_name subject_code')
    .select('student subject score maxScore normalizedScore gradeBand evaluationTitle evaluationType')
    .sort({ normalizedScore: 1 })
    .lean();

  // Grouper par étudiant pour vue consolidée
  const byStudent = {};
  for (const r of retakes) {
    const sid = r.student._id.toString();
    if (!byStudent[sid]) byStudent[sid] = { student: r.student, failedSubjects: [] };
    byStudent[sid].failedSubjects.push({
      subject:         r.subject,
      score:           r.score,
      maxScore:        r.maxScore,
      normalizedScore: r.normalizedScore,
      gradeBand:       r.gradeBand,
      evaluationTitle: r.evaluationTitle,
    });
  }

  return sendSuccess(res, 200, 'Retake list fetched.', {
    total:    Object.keys(byStudent).length,
    students: Object.values(byStudent),
  });
});

/**
 * GET /api/results/campus/overview
 * Vue analytique globale des résultats par campus.
 *
 * Query : academicYear, semester, campusId? (ADMIN/DIRECTOR)
 */
const getCampusOverview = asyncHandler(async (req, res) => {
  const { academicYear, semester } = req.query;

  if (!isManagerRole(req.user.role)) return sendForbidden(res, 'Access denied.');

  const campusFilter  = getCampusFilter(req);
  const matchFilter   = { isDeleted: false, ...campusFilter };
  if (academicYear)  matchFilter.academicYear = academicYear;
  if (semester && Object.values(SEMESTER).includes(semester)) matchFilter.semester = semester;

  const [stats] = await Result.aggregate([
    { $match: matchFilter },
    {
      $facet: {
        byStatus: [
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ],
        byEvalType: [
          { $group: { _id: '$evaluationType', count: { $sum: 1 } } },
        ],
        generalStats: [
          {
            $match: {
              status:   { $in: [RESULT_STATUS.PUBLISHED, RESULT_STATUS.ARCHIVED] },
              isDeleted: false,
            },
          },
          {
            $group: {
              _id:              null,
              avgNormalized:    { $avg: '$normalizedScore' },
              passingCount:     { $sum: { $cond: [{ $gte: ['$normalizedScore', 10] }, 1, 0] } },
              totalPublished:   { $sum: 1 },
              retakeEligible:   { $sum: { $cond: ['$isRetakeEligible', 1, 0] } },
              atRisk:           { $sum: { $cond: [{ $gte: ['$dropoutRiskScore', 60] }, 1, 0] } },
            },
          },
          {
            $project: {
              avgNormalized:  { $round: ['$avgNormalized', 2] },
              passingRate:    {
                $round: [
                  { $multiply: [{ $divide: ['$passingCount', '$totalPublished'] }, 100] },
                  1,
                ],
              },
              totalPublished: 1,
              retakeEligible: 1,
              atRisk:         1,
            },
          },
        ],
      },
    },
  ]);

  const overview = {
    byStatus:     Object.fromEntries((stats.byStatus || []).map((s) => [s._id, s.count])),
    byEvalType:   Object.fromEntries((stats.byEvalType || []).map((s) => [s._id, s.count])),
    ...(stats.generalStats?.[0] || {}),
  };
  delete overview._id;

  return sendSuccess(res, 200, 'Campus overview fetched.', overview);
});

/**
 * GET /api/results/verify/:token
 * Endpoint PUBLIC (sans authentification).
 * Valide l'authenticité d'un bulletin via le verificationToken (QR Code).
 * Retourne les informations minimales du résultat sans données sensibles.
 */
const verifyResult = asyncHandler(async (req, res) => {
  const { token } = req.params;
  if (!token) return sendError(res, 400, 'Verification token is required.');

  const result = await Result.findOne({ verificationToken: token, isDeleted: false })
    .populate('student', 'firstName lastName matricule')
    .populate('subject', 'subject_name subject_code')
    .populate('class',   'className')
    .select('student subject class academicYear semester evaluationType evaluationTitle normalizedScore gradeBand publishedAt status')
    .lean();

  if (!result || result.status === RESULT_STATUS.DRAFT)
    return sendError(res, 404, 'Invalid or expired verification token.');

  return sendSuccess(res, 200, 'Result verified. This document is authentic.', {
    isAuthentic:     true,
    student:         result.student,
    subject:         result.subject,
    class:           result.class,
    academicYear:    result.academicYear,
    semester:        result.semester,
    evaluationType:  result.evaluationType,
    evaluationTitle: result.evaluationTitle,
    scoreOn20:       result.normalizedScore,
    gradeBand:       result.gradeBand,
    publishedAt:     result.publishedAt,
  });
});

// ─── BARÈMES DE NOTATION ──────────────────────────────────────────────────────

/**
 * GET /api/results/grading-scales
 * Liste les barèmes du campus courant.
 */
const listGradingScales = asyncHandler(async (req, res) => {
  const campusFilter = getCampusFilter(req);
  const scales = await GradingScale.find({ isActive: true, ...campusFilter })
    .sort({ isDefault: -1, name: 1 })
    .lean();

  return sendSuccess(res, 200, 'Grading scales fetched.', scales);
});

/**
 * POST /api/results/grading-scales
 * Crée un nouveau barème de notation pour le campus.
 *
 * Body : { name, description?, system, maxScore, passMark, bands[], isDefault? }
 */
const createGradingScale = asyncHandler(async (req, res) => {
  if (!isManagerRole(req.user.role))
    return sendForbidden(res, 'Only managers can create grading scales.');

  const { name, description, system, maxScore, passMark, bands, isDefault } = req.body;

  if (!name || !system || maxScore == null || passMark == null)
    return sendError(res, 400, 'name, system, maxScore and passMark are required.');

  if (!Object.values(GRADING_SYSTEM).includes(system))
    return sendError(res, 400, `Invalid system. Must be: ${Object.values(GRADING_SYSTEM).join(', ')}`);

  if (Number(passMark) > Number(maxScore))
    return sendError(res, 400, 'passMark cannot exceed maxScore.');

  const { role, campusId: userCampusId } = req.user;
  const resolvedCampus = isGlobalRole(role)
    ? (req.body.schoolCampus || userCampusId)
    : userCampusId;

  if (!resolvedCampus) return sendError(res, 400, 'schoolCampus is required.');

  const scale = await GradingScale.create({
    schoolCampus: resolvedCampus,
    name, description, system,
    maxScore: Number(maxScore),
    passMark: Number(passMark),
    bands:    bands || [],
    isDefault: isDefault === true,
    createdBy: req.user.id,
  });

  return sendCreated(res, 'Grading scale created.', scale);
});

/**
 * PATCH /api/results/grading-scales/:id
 * Met à jour un barème existant.
 */
const updateGradingScale = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) return sendError(res, 400, 'Invalid grading scale ID.');

  if (!isManagerRole(req.user.role))
    return sendForbidden(res, 'Only managers can update grading scales.');

  const scale = await GradingScale.findById(id);
  if (!scale || !scale.isActive) return sendNotFound(res, 'GradingScale');

  if (!isGlobalRole(req.user.role) && scale.schoolCampus.toString() !== req.user.campusId?.toString())
    return sendForbidden(res, 'Access denied.');

  const allowed = ['name', 'description', 'passMark', 'bands', 'isDefault', 'isActive'];
  allowed.forEach((field) => {
    if (req.body[field] !== undefined) scale[field] = req.body[field];
  });
  scale.updatedBy = req.user.id;
  await scale.save();

  return sendSuccess(res, 200, 'Grading scale updated.', scale);
});

// ─── EXPORTS ──────────────────────────────────────────────────────────────────

module.exports = {
  // CRUD
  createResult,
  bulkCreateResults,
  uploadResultsCSV,
  getResults,
  getResultById,
  updateResult,
  deleteResult,
  // Workflow
  submitResult,
  submitBatch,
  publishResult,
  publishBatch,
  archiveResult,
  lockSemester,
  auditCorrection,
  // Analytics
  getTranscript,
  getClassStatistics,
  getRetakeList,
  getCampusOverview,
  verifyResult,
  // Barèmes
  listGradingScales,
  createGradingScale,
  updateGradingScale,
};