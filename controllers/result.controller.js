const Result = require('../models/result.model');
const Student = require('../models/student.model');
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
  buildCampusFilter
} = require('../utils/validationHelpers');

/**
 * @desc    Create/Enter a new result
 * @route   POST /api/result
 * @access  TEACHER, CAMPUS_MANAGER, ADMIN
 */
exports.createResult = async (req, res) => {
  try {
    const {
      student,
      exam,
      subject,
      class: classId,
      teacher,
      schoolCampus,
      score,
      maxScore,
      teacherRemarks,
      strengths,
      improvements,
      academicYear,
      semester,
      examPeriod,
      examDate,
      examWeek,
      examMonth,
      weight,
      attendance,
      specialCircumstances
    } = req.body;

    // Validate required fields
    if (!student || !exam || !subject || !classId || !teacher || !schoolCampus || 
        score === undefined || !academicYear || !semester || !examDate) {
      return sendError(res, 400, 'All required fields must be provided');
    }

    // Validate ObjectIds
    if (!isValidObjectId(student) || !isValidObjectId(exam) || !isValidObjectId(subject) ||
        !isValidObjectId(classId) || !isValidObjectId(teacher) || !isValidObjectId(schoolCampus)) {
      return sendError(res, 400, 'Invalid ID format');
    }

    // 🔥 CRITICAL: Only teacher who teaches the subject can enter results
    if (req.user.role === 'TEACHER') {
      if (req.user.userId !== teacher) {
        return sendError(res, 403, 'You can only enter results for your own classes');
      }
    }

    // 🔥 CRITICAL: Campus isolation for CAMPUS_MANAGER
    if (req.user.role === 'CAMPUS_MANAGER') {
      if (req.user.campusId !== schoolCampus) {
        return sendError(res, 403, 'You can only enter results for your own campus');
      }
    }

    // Check if result already exists for this student and exam
    const existingResult = await Result.findOne({ student, exam });
    if (existingResult) {
      return sendConflict(res, 'Result already exists for this student and exam');
    }

    // Create result (percentage, grade, mention, status computed automatically)
    const newResult = await Result.create({
      student,
      exam,
      subject,
      class: classId,
      teacher,
      schoolCampus,
      score,
      maxScore: maxScore || 20,
      teacherRemarks,
      strengths,
      improvements,
      academicYear,
      semester,
      examPeriod: examPeriod || 'Midterm',
      examDate,
      examWeek,
      examMonth,
      weight: weight || 100,
      attendance: attendance || 'present',
      specialCircumstances,
      correctedAt: new Date()
    });

    // Populate for response
    const populatedResult = await Result.findById(newResult._id)
      .populate('student', 'firstName lastName email studentClass')
      .populate('exam', 'examTitle examType')
      .populate('subject', 'subject_name subject_code coefficient')
      .populate('teacher', 'firstName lastName')
      .populate('class', 'className')
      .lean();

    return sendCreated(res, 'Result created successfully', populatedResult);

  } catch (error) {
    console.error('❌ createResult error:', error);

    if (error.code === 11000) {
      return sendConflict(res, 'Result already exists for this student and exam');
    }

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return sendError(res, 400, 'Validation failed', { errors: messages });
    }

    return sendError(res, 500, error.message || 'Failed to create result');
  }
};

/**
 * @desc    Get all results with filters
 * @route   GET /api/result
 * @access  ADMIN, DIRECTOR, CAMPUS_MANAGER, TEACHER, STUDENT
 */
exports.getAllResults = async (req, res) => {
  try {
    const {
      campusId,
      classId,
      studentId,
      teacherId,
      subjectId,
      examId,
      academicYear,
      semester,
      examPeriod,
      examWeek,
      examMonth,
      isPublished,
      status,
      page = 1,
      limit = 50
    } = req.query;

    // Build base filter
    let filter = {};

    // 🔥 CRITICAL: Campus isolation
    if (req.user.role === 'CAMPUS_MANAGER') {
      filter.schoolCampus = req.user.campusId;
    } else if (campusId && isValidObjectId(campusId)) {
      filter.schoolCampus = campusId;
    }

    // 🔥 CRITICAL: Students can only see their own published results
    if (req.user.role === 'STUDENT') {
      filter.student = req.user.userId;
      filter.isPublished = true; // Students only see published results
    } else if (studentId && isValidObjectId(studentId)) {
      filter.student = studentId;
    }

    // 🔥 CRITICAL: Teachers can only see results they entered
    if (req.user.role === 'TEACHER' && !studentId && !classId) {
      filter.teacher = req.user.userId;
    } else if (teacherId && isValidObjectId(teacherId)) {
      filter.teacher = teacherId;
    }

    // Additional filters
    if (classId && isValidObjectId(classId)) filter.class = classId;
    if (subjectId && isValidObjectId(subjectId)) filter.subject = subjectId;
    if (examId && isValidObjectId(examId)) filter.exam = examId;
    if (academicYear) filter.academicYear = academicYear;
    if (semester) filter.semester = semester;
    if (examPeriod) filter.examPeriod = examPeriod;
    if (examWeek) filter.examWeek = parseInt(examWeek);
    if (examMonth) filter.examMonth = examMonth;
    if (isPublished !== undefined) filter.isPublished = isPublished === 'true';
    if (status) filter.status = status;

    const pageNumber = parseInt(page, 10);
    const pageSize = parseInt(limit, 10);
    const skip = (pageNumber - 1) * pageSize;

    // Fetch results
    const results = await Result.find(filter)
      .populate('student', 'firstName lastName email profileImage')
      .populate('subject', 'subject_name subject_code coefficient color')
      .populate('teacher', 'firstName lastName')
      .populate('class', 'className')
      .populate('exam', 'examTitle examType')
      .sort({ examDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(pageSize)
      .lean();

    const total = await Result.countDocuments(filter);

    return sendPaginated(
      res,
      200,
      'Results retrieved successfully',
      results,
      { total, page: pageNumber, limit: pageSize }
    );

  } catch (error) {
    console.error('❌ getAllResults error:', error);
    return sendError(res, 500, 'Failed to retrieve results');
  }
};

/**
 * @desc    Get result by ID
 * @route   GET /api/result/:id
 * @access  ADMIN, DIRECTOR, CAMPUS_MANAGER, TEACHER, STUDENT (own result)
 */
exports.getResultById = async (req, res) => {
  try {
    const resultId = req.params.id;

    if (!isValidObjectId(resultId)) {
      return sendError(res, 400, 'Invalid result ID format');
    }

    const result = await Result.findById(resultId)
      .populate('student', 'firstName lastName email profileImage studentClass')
      .populate('subject', 'subject_name subject_code coefficient color')
      .populate('teacher', 'firstName lastName email')
      .populate('class', 'className')
      .populate('exam', 'examTitle examType maxScore')
      .populate('classManager', 'firstName lastName')
      .lean();

    if (!result) {
      return sendNotFound(res, 'Result');
    }

    // 🔥 CRITICAL: Access control
    if (req.user.role === 'STUDENT') {
      if (result.student._id.toString() !== req.user.userId) {
        return sendError(res, 403, 'You can only view your own results');
      }
      if (!result.isPublished) {
        return sendError(res, 403, 'This result has not been published yet');
      }
    }

    if (req.user.role === 'CAMPUS_MANAGER') {
      if (result.schoolCampus.toString() !== req.user.campusId) {
        return sendError(res, 403, 'Access denied to this result');
      }
    }

    return sendSuccess(res, 200, 'Result retrieved successfully', result);

  } catch (error) {
    console.error('❌ getResultById error:', error);
    return sendError(res, 500, 'Failed to retrieve result');
  }
};

/**
 * @desc    Update result (teacher can modify)
 * @route   PUT /api/result/:id
 * @access  TEACHER (who entered it), CAMPUS_MANAGER, ADMIN
 */
exports.updateResult = async (req, res) => {
  try {
    const resultId = req.params.id;

    if (!isValidObjectId(resultId)) {
      return sendError(res, 400, 'Invalid result ID format');
    }

    const existingResult = await Result.findById(resultId);

    if (!existingResult) {
      return sendNotFound(res, 'Result');
    }

    // 🔥 CRITICAL: Only the teacher who entered the result can modify it
    if (req.user.role === 'TEACHER') {
      if (existingResult.teacher.toString() !== req.user.userId) {
        return sendError(res, 403, 'You can only modify results you entered');
      }
    }

    // 🔥 CRITICAL: Campus isolation for CAMPUS_MANAGER
    if (req.user.role === 'CAMPUS_MANAGER') {
      if (existingResult.schoolCampus.toString() !== req.user.campusId) {
        return sendError(res, 403, 'You can only modify results from your own campus');
      }
    }

    const {
      score,
      maxScore,
      teacherRemarks,
      strengths,
      improvements,
      examDate,
      weight,
      attendance,
      specialCircumstances
    } = req.body;

    // Update fields
    if (score !== undefined) existingResult.score = score;
    if (maxScore) existingResult.maxScore = maxScore;
    if (teacherRemarks !== undefined) existingResult.teacherRemarks = teacherRemarks;
    if (strengths !== undefined) existingResult.strengths = strengths;
    if (improvements !== undefined) existingResult.improvements = improvements;
    if (examDate) existingResult.examDate = examDate;
    if (weight !== undefined) existingResult.weight = weight;
    if (attendance) existingResult.attendance = attendance;
    if (specialCircumstances !== undefined) existingResult.specialCircumstances = specialCircumstances;

    existingResult.correctedAt = new Date();

    const updatedResult = await existingResult.save();

    // Populate for response
    const populatedResult = await Result.findById(updatedResult._id)
      .populate('student', 'firstName lastName')
      .populate('subject', 'subject_name coefficient')
      .populate('teacher', 'firstName lastName')
      .lean();

    return sendSuccess(res, 200, 'Result updated successfully', populatedResult);

  } catch (error) {
    console.error('❌ updateResult error:', error);

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return sendError(res, 400, 'Validation failed', { errors: messages });
    }

    return sendError(res, 500, error.message || 'Failed to update result');
  }
};

/**
 * @desc    Delete result
 * @route   DELETE /api/result/:id
 * @access  CAMPUS_MANAGER, ADMIN only
 */
exports.deleteResult = async (req, res) => {
  try {
    const resultId = req.params.id;

    if (!isValidObjectId(resultId)) {
      return sendError(res, 400, 'Invalid result ID format');
    }

    const result = await Result.findById(resultId);

    if (!result) {
      return sendNotFound(res, 'Result');
    }

    // 🔥 CRITICAL: Only CAMPUS_MANAGER and ADMIN can delete
    if (req.user.role === 'CAMPUS_MANAGER') {
      if (result.schoolCampus.toString() !== req.user.campusId) {
        return sendError(res, 403, 'You can only delete results from your own campus');
      }
    }

    await Result.findByIdAndDelete(resultId);

    return sendSuccess(res, 200, 'Result deleted successfully');

  } catch (error) {
    console.error('❌ deleteResult error:', error);
    return sendError(res, 500, 'Failed to delete result');
  }
};

/**
 * @desc    Publish result(s)
 * @route   PATCH /api/result/:id/publish
 * @access  TEACHER, CAMPUS_MANAGER, ADMIN
 */
exports.publishResult = async (req, res) => {
  try {
    const resultId = req.params.id;

    if (!isValidObjectId(resultId)) {
      return sendError(res, 400, 'Invalid result ID format');
    }

    const result = await Result.findById(resultId);

    if (!result) {
      return sendNotFound(res, 'Result');
    }

    if (result.isPublished) {
      return sendError(res, 400, 'Result is already published');
    }

    await result.publish(req.user.userId);

    return sendSuccess(res, 200, 'Result published successfully');

  } catch (error) {
    console.error('❌ publishResult error:', error);
    return sendError(res, 500, 'Failed to publish result');
  }
};

/**
 * @desc    Unpublish result
 * @route   PATCH /api/result/:id/unpublish
 * @access  CAMPUS_MANAGER, ADMIN
 */
exports.unpublishResult = async (req, res) => {
  try {
    const resultId = req.params.id;

    if (!isValidObjectId(resultId)) {
      return sendError(res, 400, 'Invalid result ID format');
    }

    const result = await Result.findById(resultId);

    if (!result) {
      return sendNotFound(res, 'Result');
    }

    if (!result.isPublished) {
      return sendError(res, 400, 'Result is not published');
    }

    await result.unpublish();

    return sendSuccess(res, 200, 'Result unpublished successfully');

  } catch (error) {
    console.error('❌ unpublishResult error:', error);
    return sendError(res, 500, 'Failed to unpublish result');
  }
};

/**
 * @desc    Add class manager remarks
 * @route   PATCH /api/result/:id/remarks
 * @access  CAMPUS_MANAGER, ADMIN
 */
exports.addClassManagerRemarks = async (req, res) => {
  try {
    const resultId = req.params.id;
    const { classManagerRemarks } = req.body;

    if (!isValidObjectId(resultId)) {
      return sendError(res, 400, 'Invalid result ID format');
    }

    if (!classManagerRemarks) {
      return sendError(res, 400, 'Class manager remarks are required');
    }

    const result = await Result.findById(resultId);

    if (!result) {
      return sendNotFound(res, 'Result');
    }

    await result.addClassManagerRemarks(classManagerRemarks, req.user.userId);

    return sendSuccess(res, 200, 'Remarks added successfully');

  } catch (error) {
    console.error('❌ addClassManagerRemarks error:', error);
    return sendError(res, 500, 'Failed to add remarks');
  }
};

/**
 * @desc    Get class average for a subject
 * @route   GET /api/result/class/:classId/average
 * @access  ADMIN, CAMPUS_MANAGER, TEACHER
 */
exports.getClassAverage = async (req, res) => {
  try {
    const { classId } = req.params;
    const { subjectId, academicYear, semester } = req.query;

    if (!isValidObjectId(classId) || !isValidObjectId(subjectId)) {
      return sendError(res, 400, 'Invalid ID format');
    }

    if (!academicYear || !semester) {
      return sendError(res, 400, 'Academic year and semester are required');
    }

    const average = await Result.calculateClassAverage(classId, subjectId, academicYear, semester);

    return sendSuccess(res, 200, 'Class average calculated successfully', average);

  } catch (error) {
    console.error('❌ getClassAverage error:', error);
    return sendError(res, 500, 'Failed to calculate class average');
  }
};

/**
 * @desc    Get student overall average
 * @route   GET /api/result/student/:studentId/average
 * @access  ADMIN, CAMPUS_MANAGER, TEACHER, STUDENT (own average)
 */
exports.getStudentAverage = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { academicYear, semester } = req.query;

    if (!isValidObjectId(studentId)) {
      return sendError(res, 400, 'Invalid student ID format');
    }

    // Students can only see their own average
    if (req.user.role === 'STUDENT' && req.user.userId !== studentId) {
      return sendError(res, 403, 'You can only view your own average');
    }

    if (!academicYear || !semester) {
      return sendError(res, 400, 'Academic year and semester are required');
    }

    const average = await Result.calculateStudentAverage(studentId, academicYear, semester);

    return sendSuccess(res, 200, 'Student average calculated successfully', average);

  } catch (error) {
    console.error('❌ getStudentAverage error:', error);
    return sendError(res, 500, 'Failed to calculate student average');
  }
};

/**
 * @desc    Get top performers
 * @route   GET /api/result/top-performers
 * @access  ADMIN, CAMPUS_MANAGER, TEACHER
 */
exports.getTopPerformers = async (req, res) => {
  try {
    const { classId, subjectId, academicYear, semester, limit = 10 } = req.query;

    if (!isValidObjectId(classId) || !isValidObjectId(subjectId)) {
      return sendError(res, 400, 'Invalid ID format');
    }

    if (!academicYear || !semester) {
      return sendError(res, 400, 'Academic year and semester are required');
    }

    const topPerformers = await Result.getTopPerformers(
      classId,
      subjectId,
      academicYear,
      semester,
      parseInt(limit)
    );

    return sendSuccess(res, 200, 'Top performers retrieved successfully', topPerformers);

  } catch (error) {
    console.error('❌ getTopPerformers error:', error);
    return sendError(res, 500, 'Failed to retrieve top performers');
  }
};

module.exports = exports;