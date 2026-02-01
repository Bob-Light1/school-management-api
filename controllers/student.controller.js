require('dotenv').config();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
const mongoose = require('mongoose');

const Student = require('../models/student.model');
const Campus = require('../models/campus.model');
const Class = require('../models/class.model');

const { uploadImage, deleteFile, replaceFile } = require('../utils/fileUpload');
const {
  sendSuccess,
  sendError,
  sendPaginated,
  sendCreated,
  sendNotFound,
  sendConflict,
  handleDuplicateKeyError
} = require('../utils/responseHelpers');
const {
  isValidObjectId,
  isValidEmail,
  validatePasswordStrength,
  validateClassBelongsToCampus,
  checkCampusCapacity,
  buildCampusFilter
} = require('../utils/validationHelpers');

const JWT_SECRET = process.env.JWT_SECRET;
const STUDENT_FOLDER = 'students';
const SALT_ROUNDS = 10;

module.exports = {

  /**
   * Create a new student
   * @route   POST /api/students
   * @access  Private (ADMIN, CAMPUS_MANAGER, DIRECTOR)
   */
  createStudent: async (req, res) => {
    // Start transaction for data consistency
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Handle both JSON and FormData
      const fields = req.fields || req.body;
      const files = req.files || {};

      const { email, username, password, studentClass, ...rest } = fields;

      // Validate required fields
      if (!email || !username || !password) {
        await session.abortTransaction();
        return sendError(res, 400, 'Email, username, and password are required');
      }

      // Validate email format
      if (!isValidEmail(email)) {
        await session.abortTransaction();
        return sendError(res, 400, 'Invalid email format');
      }

      // Validate password strength
      const passwordValidation = validatePasswordStrength(password);
      if (!passwordValidation.valid) {
        await session.abortTransaction();
        return sendError(res, 400, 'Password does not meet requirements', {
          errors: passwordValidation.errors
        });
      }

      // Check email uniqueness
      const existingEmail = await Student.findOne({ 
        email: email.toLowerCase() 
      }).session(session);

      if (existingEmail) {
        await session.abortTransaction();
        return sendConflict(res, 'This email is already registered');
      }

      // Check username uniqueness
      const existingUser = await Student.findOne({ 
        username: username.toLowerCase() 
      }).session(session);

      if (existingUser) {
        await session.abortTransaction();
        return sendConflict(res, 'This username is already taken');
      }

      // Determine campus based on user role (CRITICAL for security)
      let campusId;
      if (req.user.role === 'CAMPUS_MANAGER') {
        // Manager can only create students in their own campus
        campusId = req.user.campusId;
      } else if (req.user.role === 'ADMIN' || req.user.role === 'DIRECTOR') {
        // Admin/Director must provide campus
        if (!fields.schoolCampus) {
          await session.abortTransaction();
          return sendError(res, 400, 'Campus ID is required for Admins');
        }
        campusId = fields.schoolCampus;
      } else {
        await session.abortTransaction();
        return sendError(res, 403, 'You are not authorized to create students');
      }

      // Validate campus exists
      const campus = await Campus.findById(campusId).session(session);
      if (!campus) {
        await session.abortTransaction();
        return sendNotFound(res, 'Campus');
      }

      // Check campus capacity
      const capacity = await checkCampusCapacity(campusId, 'students');
      if (!capacity.canAdd) {
        await session.abortTransaction();
        return sendError(res, 400, 
          `Campus has reached maximum student capacity (${capacity.max}). Current: ${capacity.current}`
        );
      }

      // Validate class belongs to campus (CRITICAL security check)
      if (studentClass) {
        const isValid = await validateClassBelongsToCampus(studentClass, campusId);
        if (!isValid) {
          await session.abortTransaction();
          return sendError(res, 400, 'The selected class does not belong to this campus');
        }
      } else {
        await session.abortTransaction();
        return sendError(res, 400, 'Student class is required');
      }

      // Handle image upload
      let profileImage = null;
      const imageFile = files.profileImage?.[0] || files.profileImage;
      
      if (imageFile) {
        try {
          profileImage = await uploadImage(imageFile, STUDENT_FOLDER, 'student');
        } catch (uploadError) {
          await session.abortTransaction();
          return sendError(res, 400, uploadError.message);
        }
      }

      // Hash password
      const salt = await bcrypt.genSalt(SALT_ROUNDS);
      const hashedPassword = await bcrypt.hash(password, salt);

      // Create student data
      const studentData = { 
        ...rest, 
        email: email.toLowerCase(), 
        username: username.toLowerCase(), 
        password: hashedPassword,
        schoolCampus: campusId,
        studentClass,
        profileImage
      };

      const student = new Student(studentData);
      const savedStudent = await student.save({ session });

      // Commit transaction
      await session.commitTransaction();

      // Populate references for response
      const populatedStudent = await Student.findById(savedStudent._id)
        .select('-password')
        .populate('studentClass', 'className level')
        .populate('schoolCampus', 'campus_name')
        .lean();

      return sendCreated(res, 'Student created successfully', populatedStudent);

    } catch (error) {
      // Rollback transaction on error
      await session.abortTransaction();
      console.error('❌ Error creating student:', error);

      if(profileImage){
        await deleteFile(STUDENT_FOLDER, profileImage) //cleaning image if DB fails
      }
      
      if (error.code === 11000) {
        return handleDuplicateKeyError(res, error);
      }

      if (error.name === 'ValidationError') {
        const messages = Object.values(error.errors).map(err => err.message);
        return sendError(res, 400, 'Validation failed', { errors: messages });
      }

      return sendError(res, 500, 'Failed to create student. Please try again');
    } finally {
      session.endSession();
    }
  },

  /**
   * Student login
   * @route   POST /api/students/login
   * @access  Public
   */
  loginStudent: async (req, res) => {
    try {
      const { email, password } = req.body;

      // Validate required fields
      if (!email || !password) {
        return sendError(res, 400, 'Email and password are required');
      }

      // JWT_SECRET verification
      if (!JWT_SECRET) {
        console.error('❌ JWT_SECRET is not defined');
        return sendError(res, 500, 'Server configuration error');
      }

      // Validate email format
      if (!isValidEmail(email)) {
        return sendError(res, 400, 'Invalid email format');
      }

      // Find student with password field
      const student = await Student.findOne({ 
        email: email.toLowerCase() 
      }).select('+password');

      // Generic error for security
      if (!student) {
        return sendError(res, 401, 'Invalid credentials');
      }

      // Compare password
      const isPasswordValid = await bcrypt.compare(password, student.password);
      if (!isPasswordValid) {
        return sendError(res, 401, 'Invalid credentials');
      }

      // Check account status
      if (student.status !== 'active') {
        return sendError(res, 403, 'Account is inactive or suspended. Please contact support');
      }

      // Generate JWT token
      const token = jwt.sign(
        { 
          id: student._id,
          campusId: student.schoolCampus,
          role: 'STUDENT', 
          name: `${student.firstName} ${student.lastName}` 
        },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      // Update last login
      student.lastLogin = new Date();
      await student.save();

      return sendSuccess(res, 200, 'Login successful', {
        token,
        user: {
          id: student._id,
          name: `${student.firstName} ${student.lastName}`,
          email: student.email,
          username: student.username,
          phone: student.phone,
          profileImage: student.profileImage,
          role: 'STUDENT'
        }
      });

    } catch (error) {
      console.error('❌ Student login error:', error);
      return sendError(res, 500, 'Internal server error during login');
    }
  },

  /**
   * Get all students with filters and pagination
   * @route   GET /api/students
   * @access  Private (ADMIN, CAMPUS_MANAGER, TEACHER, DIRECTOR)
   */
  getAllStudents: async (req, res) => {
    try {
      const { 
        campusId, 
        classId, 
        status, 
        search,
        limit = 50, 
        page = 1 
      } = req.query;
      
      // Build campus filter based on user role (CRITICAL for security)
      const filter = buildCampusFilter(req.user, campusId);
  
      if (classId) {
        // Validate class belongs to accessible campus
        if (filter.schoolCampus) {
          const isValid = await validateClassBelongsToCampus(classId, filter.schoolCampus);
          if (!isValid) {
            return sendError(res, 403, 'The selected class is not accessible to you');
          }
        }
        filter.studentClass = classId;
      }

      if (status) filter.status = status;
      
      // Search functionality
      if (search) {
        filter.$or = [
          { firstName: { $regex: search, $options: 'i' } },
          { lastName: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { username: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } },
          { matricule: { $regex: search, $options: 'i' } }
        ];
      }

      const skip = (Number(page) - 1) * Number(limit);

      // Fetch students with populated references
      const students = await Student.find(filter)
        .select('-password')
        .populate('studentClass', 'className level')
        .populate('mentor', 'firstName lastName email')
        .populate('schoolCampus', 'campus_name location.city')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean();

      const total = await Student.countDocuments(filter);

      return sendPaginated(
        res,
        200,
        'Students retrieved successfully',
        students,
        { total, page, limit }
      );

    } catch (error) {
      console.error('❌ Error fetching students:', error);
      return sendError(res, 500, 'Failed to retrieve students');
    }
  },

  /**
   * Get a single student by ID
   * @route   GET /api/students/:id
   * @access  Private
   */
  getOneStudent: async (req, res) => {
    try {
      const { id } = req.params;

      // Validate ObjectId format
      if (!isValidObjectId(id)) {
        return sendError(res, 400, 'Invalid student ID format');
      }

      // Fetch student
      const student = await Student.findById(id)
        .select('-password')
        .populate('schoolCampus', 'campus_name location')
        .populate({
          path: 'studentClass',
          select: 'className level',
          populate: { path: 'level', select: 'name' }
        })
        .populate('mentor', 'firstName lastName email')
        .lean();

      if (!student) {
        return sendNotFound(res, 'Student');
      }

      // Authorization: Students can only view their own profile
      // Staff can view students from their campus
      const isOwner = req.user?.id?.toString() === id.toString();
      const isStaff = ['ADMIN', 'CAMPUS_MANAGER', 'TEACHER', 'DIRECTOR'].includes(req.user?.role);
      
      if (!isOwner && !isStaff) {
        return sendError(res, 403, 'You are not authorized to view this profile');
      }

      // Additional campus check for staff (except ADMIN/DIRECTOR)
      if (isStaff && !['ADMIN', 'DIRECTOR'].includes(req.user.role)) {
        if (student.schoolCampus._id.toString() !== req.user.campusId) {
          return sendError(res, 403, 'This student does not belong to your campus');
        }
      }

      return sendSuccess(res, 200, 'Student retrieved successfully', student);

    } catch (error) {
      console.error('❌ Error fetching student:', error);
      return sendError(res, 500, 'Failed to retrieve student details');
    }
  },

  /**
   * Update student information
   * @route   PATCH /api/students/:id
   * @access  Private (ADMIN, CAMPUS_MANAGER, DIRECTOR)
   */
  updateStudent: async (req, res) => {
    try {
      const { id } = req.params;
      
      // Validate ObjectId
      if (!isValidObjectId(id)) {
        return sendError(res, 400, 'Invalid student ID format');
      }

      // Handle both JSON and FormData
      const fields = req.fields || req.body;
      const files = req.files || {};
      
      const updates = { ...fields };

      // Prevent password modification via this route
      delete updates.password;
      delete updates.schoolCampus; // Campus cannot be changed after creation

      // Check if student exists
      const student = await Student.findById(id);
      if (!student) {
        return sendNotFound(res, 'Student');
      }

      // Authorization: CAMPUS_MANAGER can only update students in their campus
      if (req.user.role === 'CAMPUS_MANAGER') {
        if (student.schoolCampus.toString() !== req.user.campusId) {
          return sendError(res, 403, 'You can only update students from your own campus');
        }
      } else if (!['ADMIN', 'DIRECTOR'].includes(req.user.role)) {
        return sendError(res, 403, 'You are not authorized to update students');
      }

      // Check email uniqueness if being changed
      if (updates.email && updates.email.toLowerCase() !== student.email) {
        if (!isValidEmail(updates.email)) {
          return sendError(res, 400, 'Invalid email format');
        }

        const emailExists = await Student.findOne({ 
          email: updates.email.toLowerCase(),
          _id: { $ne: id }
        });

        if (emailExists) {
          return sendConflict(res, 'This email is already in use');
        }
      }

      // Check username uniqueness if being changed
      if (updates.username && updates.username.toLowerCase() !== student.username) {
        const usernameExists = await Student.findOne({ 
          username: updates.username.toLowerCase(),
          _id: { $ne: id }
        });

        if (usernameExists) {
          return sendConflict(res, 'This username is already taken');
        }
      }

      // Validate class change (must belong to same campus)
      if (updates.studentClass && updates.studentClass !== student.studentClass.toString()) {
        const isValid = await validateClassBelongsToCampus(
          updates.studentClass, 
          student.schoolCampus
        );

        if (!isValid) {
          return sendError(res, 400, 'The selected class does not belong to the student\'s campus');
        }
      }

      // Handle image upload
      const imageFile = files.profileImage?.[0] || files.profileImage;
      
      if (imageFile) {
        try {
          const newImagePath = await replaceFile(
            imageFile,
            STUDENT_FOLDER,
            student.profileImage,
            'student'
          );
          updates.profileImage = newImagePath;
        } catch (uploadError) {
          return sendError(res, 400, uploadError.message);
        }
      }

      // Normalize email and username
      if (updates.email) {
        updates.email = updates.email.toLowerCase();
      }
      if (updates.username) {
        updates.username = updates.username.toLowerCase();
      }

      // Update student
      const updatedStudent = await Student.findByIdAndUpdate(
        id, 
        updates, 
        { new: true, runValidators: true }
      )
        .select('-password')
        .populate('studentClass', 'className level')
        .populate('schoolCampus', 'campus_name')
        .populate('mentor', 'firstName lastName email')
        .lean();

      return sendSuccess(res, 200, 'Student updated successfully', updatedStudent);

    } catch (error) {
      console.error('❌ Error updating student:', error);
      
      if (error.code === 11000) {
        return handleDuplicateKeyError(res, error);
      }

      if (error.name === 'ValidationError') {
        const messages = Object.values(error.errors).map(err => err.message);
        return sendError(res, 400, 'Validation failed', { errors: messages });
      }

      return sendError(res, 500, 'Failed to update student');
    }
  },

  /**
   * Update student password
   * @route   PATCH /api/students/:id/password
   * @access  Private (Student themselves or ADMIN)
   */
  updateStudentPassword: async (req, res) => {
    try {
      const { id } = req.params;
      const { currentPassword, newPassword } = req.body;

      // Validate ObjectId
      if (!isValidObjectId(id)) {
        return sendError(res, 400, 'Invalid student ID format');
      }

      // Validate new password
      if (!newPassword) {
        return sendError(res, 400, 'New password is required');
      }

      const passwordValidation = validatePasswordStrength(newPassword);
      if (!passwordValidation.valid) {
        return sendError(res, 400, 'Password does not meet requirements', {
          errors: passwordValidation.errors
        });
      }

      // Authorization
      const isOwner = req.user?.id === id;
      const isAdmin = ['ADMIN', 'CAMPUS_MANAGER', 'DIRECTOR'].includes(req.user?.role);

      if (!isOwner && !isAdmin) {
        return sendError(res, 403, 'You are not authorized to change this password');
      }

      // Fetch student with password
      const student = await Student.findById(id).select('+password');
      if (!student) {
        return sendNotFound(res, 'Student');
      }

      // Verify current password (skip for ADMIN)
      if (!isAdmin) {
        if (!currentPassword) {
          return sendError(res, 400, 'Current password is required');
        }

        const isMatch = await bcrypt.compare(currentPassword, student.password);
        if (!isMatch) {
          return sendError(res, 401, 'Current password is incorrect');
        }
      }

      // Hash new password
      const salt = await bcrypt.genSalt(SALT_ROUNDS);
      student.password = await bcrypt.hash(newPassword, salt);

      await student.save();

      return sendSuccess(res, 200, 'Password updated successfully');

    } catch (error) {
      console.error('❌ Password update error:', error);
      return sendError(res, 500, 'Failed to update password');
    }
  },

  /**
   * Archive student (Soft Delete)
   * @route   DELETE /api/students/:id
   * @access  Private (ADMIN, CAMPUS_MANAGER, DIRECTOR)
   */
  archiveStudent: async (req, res) => {
    try {
      const { id } = req.params;

      // Validate ObjectId
      if (!isValidObjectId(id)) {
        return sendError(res, 400, 'Invalid student ID format');
      }

      const student = await Student.findById(id);
      if (!student) {
        return sendNotFound(res, 'Student');
      }

      // Authorization
      if (req.user.role === 'CAMPUS_MANAGER') {
        if (student.schoolCampus.toString() !== req.user.campusId) {
          return sendError(res, 403, 'You can only archive students from your own campus');
        }
      }

      // Update status to archived
      student.status = 'archived';
      await student.save();

      return sendSuccess(res, 200, 'Student archived successfully');

    } catch (error) {
      console.error('❌ Error archiving student:', error);
      return sendError(res, 500, 'Failed to archive student');
    }
  },

  /**
   * Restore archived student
   * @route   PATCH /api/students/:id/restore
   * @access  Private (ADMIN, CAMPUS_MANAGER, DIRECTOR)
   */
  restoreStudent: async (req, res) => {
    try {
      const { id } = req.params;

      // Validate ObjectId
      if (!isValidObjectId(id)) {
        return sendError(res, 400, 'Invalid student ID format');
      }

      const student = await Student.findById(id);
      if (!student) {
        return sendNotFound(res, 'Student');
      }

      // Authorization
      if (req.user.role === 'CAMPUS_MANAGER') {
        if (student.schoolCampus.toString() !== req.user.campusId) {
          return sendError(res, 403, 'You can only restore students from your own campus');
        }
      }

      // Update status to active
      student.status = 'active';
      await student.save();

      return sendSuccess(res, 200, 'Student restored successfully');

    } catch (error) {
      console.error('❌ Error restoring student:', error);
      return sendError(res, 500, 'Failed to restore student');
    }
  },

  /**
   * Permanently delete student
   * @route   DELETE /api/students/:id/permanent
   * @access  Private (ADMIN only)
   */
  deleteStudentPermanently: async (req, res) => {
    try {
      const { id } = req.params;

      // Validate ObjectId
      if (!isValidObjectId(id)) {
        return sendError(res, 400, 'Invalid student ID format');
      }

      const student = await Student.findById(id);
      if (!student) {
        return sendNotFound(res, 'Student');
      }

      // Delete profile image if exists
      if (student.profileImage) {
        await deleteFile(STUDENT_FOLDER, student.profileImage);
      }

      // Delete student from database
      await Student.findByIdAndDelete(id);

      return sendSuccess(res, 200, 'Student deleted permanently');

    } catch (error) {
      console.error('❌ Error deleting student:', error);
      return sendError(res, 500, 'Failed to delete student');
    }
  }
};