'use strict';

/**
 * @file studentSchedule.controller.js
 * @description Express controller for student-facing schedule operations.
 *
 *  Alignements avec le backend foruni :
 *  ──────────────────────────────────────
 *  • Helpers : sendSuccess, sendError, sendPaginated depuis '../utils/responseHelpers'
 *  • isValidObjectId depuis '../utils/validationHelpers'
 *  • Auth JWT : req.user.id (string), req.user.role, req.user.campusId
 *  • Étudiant : req.user.classId (sa classe — student_model.studentClass)
 *  • Campus isolation : req.user.campusId pour CAMPUS_MANAGER / TEACHER / STUDENT
 *    ADMIN / DIRECTOR → accès cross-campus (campusId facultatif en query)
 *  • Teacher ref 'Teacher' (et non 'User')
 *  • Subject ref 'Subject' (et non course)
 *  • semester : 'S1' | 'S2' | 'Annual'
 *  • classes[] au lieu de groups[]
 *
 *  Routes attendues (enregistrées dans studentSchedule.router.js) :
 *  ─────────────────────────────────────────────────────────────────
 *  GET    /api/schedules/student/me                        → getMyCalendar
 *  GET    /api/schedules/student/:id                       → getSessionById
 *  GET    /api/schedules/student/export/ics                → exportCalendarICS
 *  GET    /api/schedules/student/:id/attendance            → getAttendanceForSession
 *  POST   /api/schedules/student/admin/sessions            → createSession
 *  PUT    /api/schedules/student/admin/sessions/:id        → updateSession
 *  PATCH  /api/schedules/student/admin/sessions/:id/publish → publishSession
 *  PATCH  /api/schedules/student/admin/sessions/:id/cancel  → cancelSession
 *  DELETE /api/schedules/student/admin/sessions/:id        → softDeleteSession
 *  GET    /api/schedules/student/admin/overview            → getCampusOverview
 *  GET    /api/schedules/student/admin/room-occupancy      → getRoomOccupancyReport
 */

const mongoose        = require('mongoose');
const StudentSchedule = require('../models/studentSchedule.model');
const TeacherSchedule = require('../models/teacherSchedule.model');
const { SCHEDULE_STATUS, SESSION_TYPE, SEMESTER } = require('../utils/schedule.base');

const {
  sendSuccess,
  sendError,
  sendPaginated,
  asyncHandler,
} = require('../utils/responseHelpers');

const { isValidObjectId } = require('../utils/validationHelpers');

// ─────────────────────────────────────────────
// HELPERS INTERNES
// ─────────────────────────────────────────────

const parsePositiveInt = (val, fallback) => {
  const n = parseInt(val, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/**
 * Retourne le filtre de campus selon le rôle de l'utilisateur.
 * ADMIN / DIRECTOR → accès global (possibilité de filtrer via query.campusId)
 * Autres rôles     → restreint à req.user.campusId
 */
const buildCampusFilter = (req) => {
  const { role, campusId } = req.user;
  if (['ADMIN', 'DIRECTOR'].includes(role)) {
    return req.query.campusId ? { schoolCampus: req.query.campusId } : {};
  }
  return { schoolCampus: campusId };
};

/**
 * Dispatch de notification (stub — à brancher sur Bull/RabbitMQ/SNS).
 */
const dispatchNotification = async (eventType, session, extra = {}) => {
  try {
    console.info(`[ScheduleNotification] ${eventType} → session ${session.reference}`);
    // await notificationQueue.add({ eventType, sessionId: session._id, ...extra });
  } catch (err) {
    console.error('[ScheduleNotification] dispatch failed:', err.message);
  }
};

/**
 * Génère une ligne VEVENT au format ICS (RFC 5545).
 */
const sessionToICSEvent = (session, tzid = 'UTC') => {
  const fmt = (d) =>
    d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

  const uid = `${session._id}@foruni-lms`;

  return [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTART;TZID=${tzid}:${fmt(session.startTime)}`,
    `DTEND;TZID=${tzid}:${fmt(session.endTime)}`,
    `SUMMARY:${session.subject?.subject_name ?? 'Cours'} (${session.sessionType})`,
    `DESCRIPTION:${session.topic ?? ''}`,
    `LOCATION:${session.room?.code ?? session.virtualMeeting?.joinUrl ?? 'TBD'}`,
    `STATUS:${session.status === SCHEDULE_STATUS.CANCELLED ? 'CANCELLED' : 'CONFIRMED'}`,
    `LAST-MODIFIED:${fmt(session.updatedAt || new Date())}`,
    'END:VEVENT',
  ].join('\r\n');
};

// ─────────────────────────────────────────────
// ENDPOINTS ÉTUDIANTS
// ─────────────────────────────────────────────

/**
 * GET /api/schedules/student/me
 * Emploi du temps personnel de l'étudiant connecté.
 *
 * req.user.classId  → classe de l'étudiant (student_model.studentClass)
 * req.user.campusId → campus de l'étudiant
 *
 * Query : from?, to?, sessionType?
 */
const getMyCalendar = asyncHandler(async (req, res) => {
  const { from, to, sessionType } = req.query;

  // Le JWT étudiant doit contenir classId (sa classe) et campusId
  const classId  = req.user.classId;
  const campusId = req.user.campusId;

  if (!classId) {
    return sendError(res, 400, 'No class found for this student. Please contact administration.');
  }

  const now   = new Date();
  const start = from ? new Date(from) : new Date(now.setDate(now.getDate() - now.getDay()));
  const end   = to   ? new Date(to)   : new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);

  if (isNaN(start) || isNaN(end)) {
    return sendError(res, 400, 'Invalid date range. Use ISO 8601 format.');
  }
  if (end <= start) {
    return sendError(res, 400, "'to' must be after 'from'.");
  }

  const filter = {
    'classes.classId': classId,
    schoolCampus:      campusId,
    startTime:         { $gte: start },
    endTime:           { $lte: end },
    status:            SCHEDULE_STATUS.PUBLISHED,
    isDeleted:         false,
  };

  if (sessionType && Object.values(SESSION_TYPE).includes(sessionType)) {
    filter.sessionType = sessionType;
  }

  const sessions = await StudentSchedule.find(filter)
    .sort({ startTime: 1 })
    .select('-__v')
    .lean();

  return sendSuccess(res, 200, 'Calendar fetched successfully.', sessions, {
    count: sessions.length,
    from:  start,
    to:    end,
  });
});

/**
 * GET /api/schedules/student/:id
 * Détails d'une séance publiée.
 */
const getSessionById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!isValidObjectId(id)) {
    return sendError(res, 400, 'Invalid session ID.');
  }

  const session = await StudentSchedule.findOne({
    _id:       id,
    isDeleted: false,
    status:    SCHEDULE_STATUS.PUBLISHED,
  })
    .select('-__v')
    .lean();

  if (!session) {
    return sendError(res, 404, 'Session not found or not yet published.');
  }

  return sendSuccess(res, 200, 'Session fetched.', session);
});

/**
 * GET /api/schedules/student/export/ics
 * Export ICS du calendrier étudiant.
 *
 * Query : from?, to?, tzid? (IANA timezone, défaut UTC)
 */
const exportCalendarICS = asyncHandler(async (req, res) => {
  const { from, to, tzid = 'UTC' } = req.query;
  const classId  = req.user.classId;
  const campusId = req.user.campusId;

  if (!classId) {
    return sendError(res, 400, 'No class found for this student.');
  }

  const start = from ? new Date(from) : new Date();
  const end   = to   ? new Date(to)   : new Date(start.getTime() + 90 * 24 * 60 * 60 * 1000);

  const sessions = await StudentSchedule.find({
    'classes.classId': classId,
    schoolCampus:      campusId,
    startTime:         { $gte: start },
    endTime:           { $lte: end },
    status:            SCHEDULE_STATUS.PUBLISHED,
    isDeleted:         false,
  })
    .sort({ startTime: 1 })
    .lean();

  const icsEvents = sessions.map((s) => sessionToICSEvent(s, tzid)).join('\r\n');

  const icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Foruni LMS//Student Schedule//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    icsEvents,
    'END:VCALENDAR',
  ].join('\r\n');

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="my-schedule.ics"');
  return res.status(200).send(icsContent);
});

/**
 * GET /api/schedules/student/:id/attendance
 * Résumé de présence pour une séance spécifique.
 */
const getAttendanceForSession = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!isValidObjectId(id)) {
    return sendError(res, 400, 'Invalid session ID.');
  }

  const session = await StudentSchedule.findOne({ _id: id, isDeleted: false })
    .select('reference subject startTime endTime attendance')
    .lean();

  if (!session) {
    return sendError(res, 404, 'Session not found.');
  }

  return sendSuccess(res, 200, 'Attendance fetched.', {
    sessionReference: session.reference,
    subject:          session.subject,
    startTime:        session.startTime,
    endTime:          session.endTime,
    attendance:       session.attendance,
  });
});

// ─────────────────────────────────────────────
// ENDPOINTS ADMIN / CAMPUS MANAGER
// ─────────────────────────────────────────────

/**
 * POST /api/schedules/student/admin/sessions
 * Crée une nouvelle séance (statut DRAFT).
 *
 * Body :
 *   subject       { subjectId, subject_name, subject_code?, coefficient?, department? }
 *   sessionType   SESSION_TYPE enum
 *   startTime     ISO date
 *   endTime       ISO date
 *   room          { code, building?, capacity?, equipment?[], campusName? }
 *   classIds      ObjectId[]
 *   teacher       { teacherId, firstName?, lastName?, email? }
 *   recurrence?   RecurrenceSchema
 *   schoolCampus  ObjectId  (ADMIN/DIRECTOR peuvent le préciser ; sinon req.user.campusId)
 *   isVirtual?    boolean  (true = distanciel, cohérent avec schedule.base [A])
 *   virtualMeeting? VirtualMeetingSchema
 *   topic?        string
 *   academicYear  "YYYY-YYYY"
 *   semester      'S1' | 'S2' | 'Annual'
 */
const createSession = asyncHandler(async (req, res) => {
  const {
    subject,
    sessionType,
    startTime: startRaw,
    endTime: endRaw,
    room,
    classIds = [],
    teacher,
    recurrence,
    schoolCampus: campusFromBody,
    isVirtual = false,
    virtualMeeting,
    topic,
    academicYear,
    semester,
    description,
  } = req.body;

  // ── Résolution du campus ──
  const { role, campusId: userCampusId } = req.user;
  const resolvedCampus = ['ADMIN', 'DIRECTOR'].includes(role)
    ? (campusFromBody || userCampusId)
    : userCampusId;

  if (!resolvedCampus) {
    return sendError(res, 400, 'Campus is required.');
  }

  // ── Validation de base ──
  if (!subject?.subjectId || !subject?.subject_name) {
    return sendError(res, 400, 'subject.subjectId and subject.subject_name are required.');
  }
  if (!sessionType || !Object.values(SESSION_TYPE).includes(sessionType)) {
    return sendError(
      res,
      400,
      `Invalid sessionType. Must be one of: ${Object.values(SESSION_TYPE).join(', ')}`
    );
  }
  if (!startRaw || !endRaw) {
    return sendError(res, 400, 'startTime and endTime are required.');
  }
  if (!teacher?.teacherId) {
    return sendError(res, 400, 'teacher.teacherId is required.');
  }
  if (!classIds.length) {
    return sendError(res, 400, 'At least one classId must be provided.');
  }
  if (!academicYear || !/^\d{4}-\d{4}$/.test(academicYear)) {
    return sendError(res, 400, 'academicYear must match format YYYY-YYYY (e.g. 2024-2025).');
  }
  if (!semester || !Object.values(SEMESTER).includes(semester)) {
    return sendError(
      res,
      400,
      `semester must be one of: ${Object.values(SEMESTER).join(', ')}.`
    );
  }

  const startTime = new Date(startRaw);
  const endTime   = new Date(endRaw);

  if (isNaN(startTime) || isNaN(endTime)) {
    return sendError(res, 400, 'Invalid date values for startTime or endTime.');
  }
  if (endTime <= startTime) {
    return sendError(res, 400, 'endTime must be strictly after startTime.');
  }

  // ── Détection de conflits (classe + salle) ──
  const { hasConflict, conflicts } = await StudentSchedule.detectConflicts({
    startTime,
    endTime,
    schoolCampus: resolvedCampus,
    roomCode:     room?.code,
    classIds:     classIds.map((id) => new mongoose.Types.ObjectId(id)),
  });

  if (hasConflict) {
    return sendError(res, 409, 'Scheduling conflict detected.', conflicts);
  }

  // ── Conflit enseignant ──
  const { hasConflict: teacherConflict, conflicts: teacherConflicts } =
    await TeacherSchedule.detectTeacherConflicts({
      teacherId: new mongoose.Types.ObjectId(teacher.teacherId),
      startTime,
      endTime,
    });

  if (teacherConflict) {
    return sendError(
      res,
      409,
      'The assigned teacher already has a session in this time slot.',
      teacherConflicts
    );
  }

  // ── Création ──
  const session = await StudentSchedule.create({
    subject,
    sessionType,
    startTime,
    endTime,
    room,
    classes: classIds.map((id) => ({ classId: id })),
    teacher,
    recurrence,
    schoolCampus:   resolvedCampus,
    isVirtual,
    virtualMeeting,
    topic,
    academicYear,
    semester,
    description,
    lastModifiedBy: req.user.id,
  });

  return sendSuccess(res, 201, 'Session created as DRAFT.', session);
});

/**
 * PUT /api/schedules/student/admin/sessions/:id
 * Met à jour une séance existante. Relance les détections de conflits.
 */
const updateSession = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!isValidObjectId(id)) {
    return sendError(res, 400, 'Invalid session ID.');
  }

  const campusFilter = buildCampusFilter(req);
  const session = await StudentSchedule.findOne({
    _id: id,
    isDeleted: false,
    ...campusFilter,
  });

  if (!session) {
    return sendError(res, 404, 'Session not found.');
  }

  const { startTime: startRaw, endTime: endRaw, room, classIds, teacher } = req.body;

  const newStart = startRaw ? new Date(startRaw) : session.startTime;
  const newEnd   = endRaw   ? new Date(endRaw)   : session.endTime;

  if (newEnd <= newStart) {
    return sendError(res, 400, 'endTime must be strictly after startTime.');
  }

  const newClassIds = classIds
    ? classIds.map((id) => new mongoose.Types.ObjectId(id))
    : session.classes.map((c) => c.classId);

  const newRoomCode = room?.code || session.room?.code;

  const { hasConflict, conflicts } = await StudentSchedule.detectConflicts({
    startTime:    newStart,
    endTime:      newEnd,
    schoolCampus: session.schoolCampus,
    roomCode:     newRoomCode,
    classIds:     newClassIds,
    excludeId:    session._id,
  });

  if (hasConflict) {
    return sendError(res, 409, 'Scheduling conflict detected after update.', conflicts);
  }

  const teacherId = teacher?.teacherId
    ? new mongoose.Types.ObjectId(teacher.teacherId)
    : session.teacher.teacherId;

  const { hasConflict: teacherConflict, conflicts: teacherConflicts } =
    await TeacherSchedule.detectTeacherConflicts({
      teacherId,
      startTime:  newStart,
      endTime:    newEnd,
      excludeId:  session.studentScheduleRef,
    });

  if (teacherConflict) {
    return sendError(res, 409, 'Teacher conflict detected after update.', teacherConflicts);
  }

  const wasPublished = session.status === SCHEDULE_STATUS.PUBLISHED;

  const allowedFields = [
    'subject', 'sessionType', 'startTime', 'endTime', 'room', 'teacher',
    'schoolCampus', 'isVirtual', 'virtualMeeting', 'topic', 'description',
    'materials', 'recurrence', 'academicYear', 'semester',
  ];

  allowedFields.forEach((field) => {
    if (req.body[field] !== undefined) session[field] = req.body[field];
  });

  if (classIds) {
    session.classes = classIds.map((cid) => ({ classId: cid }));
  }

  session.lastModifiedBy = req.user.id;
  await session.save();

  if (wasPublished) {
    await dispatchNotification('SESSION_MODIFIED', session, { modifiedBy: req.user.id });
  }

  return sendSuccess(res, 200, 'Session updated successfully.', session);
});

/**
 * PATCH /api/schedules/student/admin/sessions/:id/publish
 * Passe une séance DRAFT → PUBLISHED.
 */
const publishSession = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!isValidObjectId(id)) {
    return sendError(res, 400, 'Invalid session ID.');
  }

  const campusFilter = buildCampusFilter(req);
  const session = await StudentSchedule.findOne({
    _id: id, isDeleted: false, ...campusFilter,
  });

  if (!session) return sendError(res, 404, 'Session not found.');
  if (session.status === SCHEDULE_STATUS.PUBLISHED) {
    return sendError(res, 400, 'Session is already published.');
  }
  if (session.status === SCHEDULE_STATUS.CANCELLED) {
    return sendError(res, 400, 'Cannot publish a cancelled session.');
  }

  session.status         = SCHEDULE_STATUS.PUBLISHED;
  session.publishedAt    = new Date();
  session.publishedBy    = req.user.id;
  session.lastModifiedBy = req.user.id;
  await session.save();

  await dispatchNotification('SESSION_PUBLISHED', session);

  return sendSuccess(res, 200, 'Session published. Notifications dispatched.', session);
});

/**
 * PATCH /api/schedules/student/admin/sessions/:id/cancel
 * Annule une séance.
 * Body : { reason? }
 */
const cancelSession = asyncHandler(async (req, res) => {
  const { id }          = req.params;
  const { reason = '' } = req.body;

  if (!isValidObjectId(id)) {
    return sendError(res, 400, 'Invalid session ID.');
  }

  const campusFilter = buildCampusFilter(req);
  const session = await StudentSchedule.findOne({
    _id: id, isDeleted: false, ...campusFilter,
  });

  if (!session) return sendError(res, 404, 'Session not found.');
  if (session.status === SCHEDULE_STATUS.CANCELLED) {
    return sendError(res, 400, 'Session is already cancelled.');
  }

  session.status         = SCHEDULE_STATUS.CANCELLED;
  session.lastModifiedBy = req.user.id;
  if (reason) session.description = `[CANCELLED] ${reason}`;
  await session.save();

  await dispatchNotification('SESSION_CANCELLED', session, { reason });

  return sendSuccess(res, 200, 'Session cancelled. Notifications dispatched.', session);
});

/**
 * DELETE /api/schedules/student/admin/sessions/:id
 * Soft-delete d'une séance.
 */
const softDeleteSession = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!isValidObjectId(id)) {
    return sendError(res, 400, 'Invalid session ID.');
  }

  const campusFilter = buildCampusFilter(req);
  const session = await StudentSchedule.findOneAndUpdate(
    { _id: id, isDeleted: false, ...campusFilter },
    {
      isDeleted:      true,
      deletedAt:      new Date(),
      deletedBy:      req.user.id,
      lastModifiedBy: req.user.id,
    },
    { new: true }
  );

  if (!session) return sendError(res, 404, 'Session not found.');

  return sendSuccess(res, 200, 'Session deleted.', { _id: session._id });
});

// ─────────────────────────────────────────────
// ANALYTICS
// ─────────────────────────────────────────────

/**
 * GET /api/schedules/student/admin/overview
 * Vue d'ensemble paginée des séances.
 *
 * Query : from, to, status, roomCode, teacherId, classId,
 *          campusId (ADMIN/DIRECTOR uniquement), page, limit
 */
const getCampusOverview = asyncHandler(async (req, res) => {
  const {
    from,
    to,
    status,
    roomCode,
    teacherId,
    classId,
    page  = 1,
    limit = 50,
  } = req.query;

  const now   = new Date();
  const start = from ? new Date(from) : new Date(now.setHours(0, 0, 0, 0));
  const end   = to   ? new Date(to)   : new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);

  const filter = {
    startTime:  { $gte: start },
    endTime:    { $lte: end },
    isDeleted:  false,
    ...buildCampusFilter(req),
  };

  if (status && Object.values(SCHEDULE_STATUS).includes(status)) {
    filter.status = status;
  }
  if (roomCode)                                filter['room.code']              = roomCode;
  if (teacherId && isValidObjectId(teacherId)) filter['teacher.teacherId']      = new mongoose.Types.ObjectId(teacherId);
  if (classId   && isValidObjectId(classId))   filter['classes.classId']        = new mongoose.Types.ObjectId(classId);

  const pageNum  = parsePositiveInt(page, 1);
  const limitNum = parsePositiveInt(limit, 50);
  const skip     = (pageNum - 1) * limitNum;

  const [sessions, total] = await Promise.all([
    StudentSchedule.find(filter)
      .sort({ startTime: 1 })
      .skip(skip)
      .limit(limitNum)
      .select('-__v')
      .lean(),
    StudentSchedule.countDocuments(filter),
  ]);

  return sendPaginated(
    res,
    200,
    'Overview fetched.',
    sessions,
    { total, page: pageNum, limit: limitNum }
  );
});

/**
 * GET /api/schedules/student/admin/room-occupancy
 * Rapport d'occupation des salles par campus.
 *
 * Query : from, to, campusId (ADMIN/DIRECTOR)
 */
const getRoomOccupancyReport = asyncHandler(async (req, res) => {
  const { from, to } = req.query;

  const now   = new Date();
  const start = from ? new Date(from) : new Date(now.getFullYear(), now.getMonth(), 1);
  const end   = to   ? new Date(to)   : new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const matchStage = {
    startTime:  { $gte: start },
    endTime:    { $lte: end },
    isDeleted:  false,
    status:     { $in: [SCHEDULE_STATUS.PUBLISHED, SCHEDULE_STATUS.CANCELLED] },
    'room.code':{ $exists: true, $ne: null },
    ...buildCampusFilter(req),
  };

  const report = await StudentSchedule.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id:               '$room.code',
        campusName:        { $first: '$room.campusName' },
        capacity:          { $first: '$room.capacity' },
        totalSessions:     { $sum: 1 },
        confirmedSessions: {
          $sum: { $cond: [{ $eq: ['$status', SCHEDULE_STATUS.PUBLISHED] }, 1, 0] },
        },
        cancelledSessions: {
          $sum: { $cond: [{ $eq: ['$status', SCHEDULE_STATUS.CANCELLED] }, 1, 0] },
        },
        totalMinutes: { $sum: '$durationMinutes' },
      },
    },
    {
      $project: {
        roomCode:          '$_id',
        campusName:        1,
        capacity:          1,
        totalSessions:     1,
        confirmedSessions: 1,
        cancelledSessions: 1,
        totalHours:        { $round: [{ $divide: ['$totalMinutes', 60] }, 1] },
        cancellationRate: {
          $cond: [
            { $gt: ['$totalSessions', 0] },
            {
              $round: [
                { $multiply: [{ $divide: ['$cancelledSessions', '$totalSessions'] }, 100] },
                1,
              ],
            },
            0,
          ],
        },
      },
    },
    { $sort: { totalSessions: -1 } },
  ]);

  return sendSuccess(res, 200, 'Room occupancy report fetched.', report, {
    from:       start,
    to:         end,
    totalRooms: report.length,
  });
});

// ─────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────

module.exports = {
  // Étudiant
  getMyCalendar,
  getSessionById,
  exportCalendarICS,
  getAttendanceForSession,
  // Admin / Campus Manager
  createSession,
  updateSession,
  publishSession,
  cancelSession,
  softDeleteSession,
  getCampusOverview,
  getRoomOccupancyReport,
};