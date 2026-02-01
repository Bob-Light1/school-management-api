const Schedule = require('../models/schedule.model');
const {
  sendSuccess,
  sendError,
  sendCreated,
  sendNotFound,
  sendConflict,
  sendPaginated,
  handleDuplicateKeyError
} = require('../utils/responseHelpers');
const {
  isValidObjectId,
  buildCampusFilter,
  validateTeacherBelongsToCampus,
  validateClassBelongsToCampus
} = require('../utils/validationHelpers');

/**
 * @desc    Create a new schedule entry
 * @route   POST /api/schedule
 * @access  ADMIN, DIRECTOR, CAMPUS_MANAGER
 */
exports.createSchedule = async (req, res) => {
  try {
    const {
      schoolCampus,
      class: classId,
      subject,
      teacher,
      dayOfWeek,
      startTime,
      endTime,
      room,
      building,
      academicYear,
      semester,
      weekNumber,
      sessionType,
      notes,
      color
    } = req.body;

    // Validate required fields
    if (!schoolCampus || !classId || !subject || !teacher || !dayOfWeek || 
        !startTime || !endTime || !academicYear || !semester) {
      return sendError(res, 400, 'All required fields must be provided');
    }

    // Validate ObjectIds
    if (!isValidObjectId(schoolCampus) || !isValidObjectId(classId) || 
        !isValidObjectId(subject) || !isValidObjectId(teacher)) {
      return sendError(res, 400, 'Invalid ID format');
    }

    // 🔥 CRITICAL: Campus isolation enforcement
    if (req.user.role === 'CAMPUS_MANAGER') {
      if (req.user.campusId !== schoolCampus) {
        return sendError(res, 403, 'You can only create schedules for your own campus');
      }
    }

    // Validate cross-campus relationships
    const isTeacherValid = await validateTeacherBelongsToCampus(teacher, schoolCampus);
    if (!isTeacherValid) {
      return sendError(res, 400, 'Teacher must belong to the same campus');
    }

    const isClassValid = await validateClassBelongsToCampus(classId, schoolCampus);
    if (!isClassValid) {
      return sendError(res, 400, 'Class must belong to the same campus');
    }

    // Check for scheduling conflicts
    const conflicts = await Schedule.checkConflicts({
      teacher,
      class: classId,
      room,
      dayOfWeek,
      startTime,
      endTime,
      academicYear,
      semester
    });

    if (conflicts.length > 0) {
      const conflictTypes = [];
      conflicts.forEach(c => {
        if (c.teacher.toString() === teacher) conflictTypes.push('teacher');
        if (c.class.toString() === classId) conflictTypes.push('class');
        if (c.room === room) conflictTypes.push('room');
      });
      
      return sendConflict(
        res, 
        `Scheduling conflict detected for ${conflictTypes.join(', ')}. Please choose a different time slot.`
      );
    }

    // Create schedule
    const newSchedule = await Schedule.create({
      schoolCampus,
      class: classId,
      subject,
      teacher,
      dayOfWeek,
      startTime,
      endTime,
      room,
      building,
      academicYear,
      semester,
      weekNumber,
      sessionType: sessionType || 'lecture',
      notes,
      color: color || '#1976d2'
    });

    // Populate for response
    const populatedSchedule = await Schedule.findById(newSchedule._id)
      .populate('schoolCampus', 'campus_name')
      .populate('class', 'className')
      .populate('subject', 'subject_name subject_code color')
      .populate('teacher', 'firstName lastName email')
      .lean();

    return sendCreated(res, 'Schedule created successfully', populatedSchedule);

  } catch (error) {
    console.error('❌ createSchedule error:', error);

    if (error.code === 11000) {
      return handleDuplicateKeyError(res, error);
    }

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return sendError(res, 400, 'Validation failed', { errors: messages });
    }

    return sendError(res, 500, error.message || 'Failed to create schedule');
  }
};

/**
 * @desc    Get all schedules with filters
 * @route   GET /api/schedule
 * @access  ADMIN, DIRECTOR, CAMPUS_MANAGER, TEACHER
 */
exports.getAllSchedules = async (req, res) => {
  try {
    const {
      campusId,
      classId,
      teacherId,
      subjectId,
      dayOfWeek,
      academicYear,
      semester,
      status,
      page = 1,
      limit = 100
    } = req.query;

    // 🔥 CRITICAL: Build campus filter
    const filter = buildCampusFilter(req.user, campusId);

    // Additional filters
    if (classId && isValidObjectId(classId)) filter.class = classId;
    if (teacherId && isValidObjectId(teacherId)) filter.teacher = teacherId;
    if (subjectId && isValidObjectId(subjectId)) filter.subject = subjectId;
    if (dayOfWeek) filter.dayOfWeek = dayOfWeek;
    if (academicYear) filter.academicYear = academicYear;
    if (semester) filter.semester = semester;
    if (status) filter.status = status;

    const pageNumber = parseInt(page, 10);
    const pageSize = parseInt(limit, 10);
    const skip = (pageNumber - 1) * pageSize;

    // Fetch schedules
    const schedules = await Schedule.find(filter)
      .populate('schoolCampus', 'campus_name')
      .populate('class', 'className')
      .populate('subject', 'subject_name subject_code color')
      .populate('teacher', 'firstName lastName email')
      .sort({ dayOfWeek: 1, startTime: 1 })
      .skip(skip)
      .limit(pageSize)
      .lean();

    const total = await Schedule.countDocuments(filter);

    return sendPaginated(
      res,
      200,
      'Schedules retrieved successfully',
      schedules,
      { total, page: pageNumber, limit: pageSize }
    );

  } catch (error) {
    console.error('❌ getAllSchedules error:', error);
    return sendError(res, 500, 'Failed to retrieve schedules');
  }
};

/**
 * @desc    Get schedule by ID
 * @route   GET /api/schedule/:id
 * @access  ADMIN, DIRECTOR, CAMPUS_MANAGER, TEACHER, STUDENT
 */
exports.getScheduleById = async (req, res) => {
  try {
    const scheduleId = req.params.id;

    if (!isValidObjectId(scheduleId)) {
      return sendError(res, 400, 'Invalid schedule ID format');
    }

    const schedule = await Schedule.findById(scheduleId)
      .populate('schoolCampus', 'campus_name')
      .populate('class', 'className')
      .populate('subject', 'subject_name subject_code color coefficient')
      .populate('teacher', 'firstName lastName email phone')
      .lean();

    if (!schedule) {
      return sendNotFound(res, 'Schedule');
    }

    // 🔥 CRITICAL: Campus isolation check
    if (req.user.role === 'CAMPUS_MANAGER') {
      if (schedule.schoolCampus._id.toString() !== req.user.campusId) {
        return sendError(res, 403, 'Access denied to this schedule');
      }
    }

    return sendSuccess(res, 200, 'Schedule retrieved successfully', schedule);

  } catch (error) {
    console.error('❌ getScheduleById error:', error);
    return sendError(res, 500, 'Failed to retrieve schedule');
  }
};

/**
 * @desc    Get schedule for a specific class
 * @route   GET /api/schedule/class/:classId
 * @access  ADMIN, DIRECTOR, CAMPUS_MANAGER, TEACHER, STUDENT
 */
exports.getClassSchedule = async (req, res) => {
  try {
    const { classId } = req.params;
    const { academicYear, semester, dayOfWeek } = req.query;

    if (!isValidObjectId(classId)) {
      return sendError(res, 400, 'Invalid class ID format');
    }

    if (!academicYear || !semester) {
      return sendError(res, 400, 'Academic year and semester are required');
    }

    const filter = {
      class: classId,
      academicYear,
      semester,
      status: 'active'
    };

    if (dayOfWeek) {
      filter.dayOfWeek = dayOfWeek;
    }

    const schedules = await Schedule.find(filter)
      .populate('subject', 'subject_name subject_code color')
      .populate('teacher', 'firstName lastName')
      .sort({ dayOfWeek: 1, startTime: 1 })
      .lean();

    return sendSuccess(res, 200, 'Class schedule retrieved successfully', schedules);

  } catch (error) {
    console.error('❌ getClassSchedule error:', error);
    return sendError(res, 500, 'Failed to retrieve class schedule');
  }
};

/**
 * @desc    Get schedule for a specific teacher
 * @route   GET /api/schedule/teacher/:teacherId
 * @access  ADMIN, DIRECTOR, CAMPUS_MANAGER, TEACHER (own schedule)
 */
exports.getTeacherSchedule = async (req, res) => {
  try {
    const { teacherId } = req.params;
    const { academicYear, semester, dayOfWeek } = req.query;

    if (!isValidObjectId(teacherId)) {
      return sendError(res, 400, 'Invalid teacher ID format');
    }

    // Teachers can only view their own schedule
    if (req.user.role === 'TEACHER' && req.user.userId !== teacherId) {
      return sendError(res, 403, 'You can only view your own schedule');
    }

    if (!academicYear || !semester) {
      return sendError(res, 400, 'Academic year and semester are required');
    }

    const filter = {
      teacher: teacherId,
      academicYear,
      semester,
      status: 'active'
    };

    if (dayOfWeek) {
      filter.dayOfWeek = dayOfWeek;
    }

    const schedules = await Schedule.find(filter)
      .populate('class', 'className')
      .populate('subject', 'subject_name subject_code color')
      .sort({ dayOfWeek: 1, startTime: 1 })
      .lean();

    return sendSuccess(res, 200, 'Teacher schedule retrieved successfully', schedules);

  } catch (error) {
    console.error('❌ getTeacherSchedule error:', error);
    return sendError(res, 500, 'Failed to retrieve teacher schedule');
  }
};

/**
 * @desc    Update schedule
 * @route   PUT /api/schedule/:id
 * @access  ADMIN, DIRECTOR, CAMPUS_MANAGER
 */
exports.updateSchedule = async (req, res) => {
  try {
    const scheduleId = req.params.id;

    if (!isValidObjectId(scheduleId)) {
      return sendError(res, 400, 'Invalid schedule ID format');
    }

    const existingSchedule = await Schedule.findById(scheduleId);

    if (!existingSchedule) {
      return sendNotFound(res, 'Schedule');
    }

    // 🔥 CRITICAL: Campus isolation check
    if (req.user.role === 'CAMPUS_MANAGER') {
      if (existingSchedule.schoolCampus.toString() !== req.user.campusId) {
        return sendError(res, 403, 'You can only update schedules from your own campus');
      }
    }

    const {
      class: classId,
      subject,
      teacher,
      dayOfWeek,
      startTime,
      endTime,
      room,
      building,
      sessionType,
      notes,
      color,
      status
    } = req.body;

    // Check for conflicts if time/day/room/teacher/class changed
    if (dayOfWeek || startTime || endTime || teacher || classId || room) {
      const conflicts = await Schedule.checkConflicts({
        _id: scheduleId,
        teacher: teacher || existingSchedule.teacher,
        class: classId || existingSchedule.class,
        room: room || existingSchedule.room,
        dayOfWeek: dayOfWeek || existingSchedule.dayOfWeek,
        startTime: startTime || existingSchedule.startTime,
        endTime: endTime || existingSchedule.endTime,
        academicYear: existingSchedule.academicYear,
        semester: existingSchedule.semester
      });

      if (conflicts.length > 0) {
        return sendConflict(res, 'Scheduling conflict detected. Please choose a different time slot.');
      }
    }

    // Update fields
    if (classId) existingSchedule.class = classId;
    if (subject) existingSchedule.subject = subject;
    if (teacher) existingSchedule.teacher = teacher;
    if (dayOfWeek) existingSchedule.dayOfWeek = dayOfWeek;
    if (startTime) existingSchedule.startTime = startTime;
    if (endTime) existingSchedule.endTime = endTime;
    if (room !== undefined) existingSchedule.room = room;
    if (building !== undefined) existingSchedule.building = building;
    if (sessionType) existingSchedule.sessionType = sessionType;
    if (notes !== undefined) existingSchedule.notes = notes;
    if (color) existingSchedule.color = color;
    if (status) existingSchedule.status = status;

    const updatedSchedule = await existingSchedule.save();

    // Populate for response
    const populatedSchedule = await Schedule.findById(updatedSchedule._id)
      .populate('schoolCampus', 'campus_name')
      .populate('class', 'className')
      .populate('subject', 'subject_name subject_code color')
      .populate('teacher', 'firstName lastName')
      .lean();

    return sendSuccess(res, 200, 'Schedule updated successfully', populatedSchedule);

  } catch (error) {
    console.error('❌ updateSchedule error:', error);

    if (error.code === 11000) {
      return handleDuplicateKeyError(res, error);
    }

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return sendError(res, 400, 'Validation failed', { errors: messages });
    }

    return sendError(res, 500, error.message || 'Failed to update schedule');
  }
};

/**
 * @desc    Cancel a schedule (soft delete)
 * @route   DELETE /api/schedule/:id
 * @access  ADMIN, DIRECTOR, CAMPUS_MANAGER
 */
exports.cancelSchedule = async (req, res) => {
  try {
    const scheduleId = req.params.id;
    const { reason } = req.body;

    if (!isValidObjectId(scheduleId)) {
      return sendError(res, 400, 'Invalid schedule ID format');
    }

    const schedule = await Schedule.findById(scheduleId);

    if (!schedule) {
      return sendNotFound(res, 'Schedule');
    }

    // 🔥 CRITICAL: Campus isolation check
    if (req.user.role === 'CAMPUS_MANAGER') {
      if (schedule.schoolCampus.toString() !== req.user.campusId) {
        return sendError(res, 403, 'You can only cancel schedules from your own campus');
      }
    }

    if (schedule.status === 'cancelled') {
      return sendError(res, 400, 'Schedule is already cancelled');
    }

    await schedule.cancel(reason, req.user.userId, req.user.role);

    return sendSuccess(res, 200, 'Schedule cancelled successfully');

  } catch (error) {
    console.error('❌ cancelSchedule error:', error);
    return sendError(res, 500, 'Failed to cancel schedule');
  }
};

/**
 * @desc    Delete schedule permanently
 * @route   DELETE /api/schedule/:id/permanent
 * @access  ADMIN only
 */
exports.deleteSchedulePermanently = async (req, res) => {
  try {
    const scheduleId = req.params.id;

    if (!isValidObjectId(scheduleId)) {
      return sendError(res, 400, 'Invalid schedule ID format');
    }

    const schedule = await Schedule.findByIdAndDelete(scheduleId);

    if (!schedule) {
      return sendNotFound(res, 'Schedule');
    }

    return sendSuccess(res, 200, 'Schedule deleted permanently');

  } catch (error) {
    console.error('❌ deleteSchedulePermanently error:', error);
    return sendError(res, 500, 'Failed to delete schedule');
  }
};