require('dotenv').config();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const Teacher = require('../models/teacher.model');
const Campus = require('../models/campus.model');

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
  validateMultipleClassesBelongToCampus,
  checkCampusCapacity,
  buildCampusFilter
} = require('../utils/validationHelpers');

// Constants
const JWT_SECRET = process.env.JWT_SECRET;
const TEACHER_FOLDER = 'teachers';
const SALT_ROUNDS = 10;

module.exports = {

  /**
   * Create a new teacher
   * @route   POST /api/teacher
   * @access  Private (ADMIN, CAMPUS_MANAGER, DIRECTOR)
   */
  createTeacher: async (req, res) => {
    // Start transaction for data consistency
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Handle both JSON and FormData
      const fields = req.fields || req.body;
      const files = req.files || {};

      const { email, username, password, classes, ...rest } = fields;

      // Validate required fields
      if (!email || !password) {
        await session.abortTransaction();
        return sendError(res, 400, 'Email and password are required');
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
      const existingEmail = await Teacher.findOne({ 
        email: email.toLowerCase().trim() 
      }).session(session);
      
      if (existingEmail) {
        await session.abortTransaction();
        return sendConflict(res, 'A teacher with this email is already registered');
      }

      // Check username uniqueness if provided
      if (username) {
        const existingUser = await Teacher.findOne({ 
          username: username.toLowerCase().trim() 
        }).session(session);
        
        if (existingUser) {
          await session.abortTransaction();
          return sendConflict(res, 'This username is already taken');
        }
      }

      // Determine campus based on user role (CRITICAL for security)
      let campusId;
      if (req.user.role === 'CAMPUS_MANAGER') {
        // Manager can only create teachers in their own campus
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
        return sendError(res, 403, 'You are not authorized to create teachers');
      }

      // Validate campus exists
      const campus = await Campus.findById(campusId).session(session);
      if (!campus) {
        await session.abortTransaction();
        return sendNotFound(res, 'Campus');
      }

      // Check campus capacity
      const capacity = await checkCampusCapacity(campusId, 'teachers');
      if (!capacity.canAdd) {
        await session.abortTransaction();
        return sendError(res, 400, 
          `Campus has reached maximum teacher capacity (${capacity.max}). Current: ${capacity.current}`
        );
      }

      // Validate classes belong to campus (if provided)
      if (classes && Array.isArray(classes) && classes.length > 0) {
        const validation = await validateMultipleClassesBelongToCampus(classes, campusId);
        if (!validation.valid) {
          await session.abortTransaction();
          return sendError(res, 400, 'Some assigned classes do not belong to this campus');
        }
      }

      // Handle image upload
      let teacher_image = null;
      const imageFile = files.teacher_image?.[0] || files.teacher_image || files.image?.[0] || files.image;
      
      if (imageFile) {
        try {
          teacher_image = await uploadImage(imageFile, TEACHER_FOLDER, 'teacher');
        } catch (uploadError) {
          await session.abortTransaction();
          return sendError(res, 400, uploadError.message);
        }
      }

      // Hash password
      const salt = await bcrypt.genSalt(SALT_ROUNDS);
      const hashedPassword = await bcrypt.hash(password, salt);

      // Create teacher data
      const teacherData = { 
        ...rest, 
        email: email.toLowerCase().trim(), 
        username: username ? username.toLowerCase().trim() : undefined,
        password: hashedPassword,
        schoolCampus: campusId,
        classes: classes || [],
        teacher_image
      };

      const teacher = new Teacher(teacherData);
      const savedTeacher = await teacher.save({ session });

      // Commit transaction
      await session.commitTransaction();

      // Populate references for response
      const populatedTeacher = await Teacher.findById(savedTeacher._id)
        .select('-password -salary')
        .populate('schoolCampus', 'campus_name')
        .populate('subjects', 'subjectName')
        .populate('classes', 'className')
        .lean();

      return sendCreated(res, 'Teacher created successfully', populatedTeacher);

    } catch (error) {
      // Rollback transaction on error
      await session.abortTransaction();
      console.error('❌ Error creating teacher:', error);
      
      if (error.code === 11000) {
        return handleDuplicateKeyError(res, error);
      }

      if (error.name === 'ValidationError') {
        const messages = Object.values(error.errors).map(err => err.message);
        return sendError(res, 400, 'Validation failed', { errors: messages });
      }

      return sendError(res, 500, 'Failed to create teacher. Please try again');
    } finally {
      session.endSession();
    }
  },

  /**
   * Teacher login
   * @route   POST /api/teacher/login
   * @access  Public
   */
  loginTeacher: async (req, res) => {
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

      // Find teacher with password field
      const teacher = await Teacher.findOne({ 
        email: email.toLowerCase().trim() 
      }).select('+password');

      // Generic error for security
      if (!teacher) {
        return sendError(res, 401, 'Invalid email or password');
      }

      // Compare password
      const isPasswordValid = await bcrypt.compare(password, teacher.password);
      if (!isPasswordValid) {
        return sendError(res, 401, 'Invalid email or password');
      }

      // Check account status
      if (teacher.status !== 'active') {
        return sendError(res, 403, 'Account is inactive or suspended. Please contact support');
      }

      // Generate JWT token
      const token = jwt.sign(
        { 
          id: teacher._id,
          campusId: teacher.schoolCampus,
          role: 'TEACHER',
          roles: teacher.roles,
          name: teacher.fullName
        },
        JWT_SECRET,
        { 
          expiresIn: '7d',
          issuer: 'school-management-app'
        }
      );

      // Update last login
      teacher.lastLogin = new Date();
      await teacher.save();

      return sendSuccess(res, 200, 'Login successful', {
        token,
        user: {
          id: teacher._id,
          name: teacher.fullName,
          email: teacher.email,
          username: teacher.username,
          phone: teacher.phone,
          image: teacher.teacher_image,
          roles: teacher.roles,
          role: 'TEACHER'
        }
      });

    } catch (error) {
      console.error('❌ Teacher login error:', error);
      return sendError(res, 500, 'Internal server error during login');
    }
  },

  /**
   * Get all teachers with filters and pagination
   * @route   GET /api/teacher
   * @access  Private (ADMIN, CAMPUS_MANAGER, DIRECTOR)
   * 
   * 🔥 CRITICAL SECURITY FIX: Campus isolation enforced
   */
  getAllTeachers: async (req, res) => {
    try {
      const { 
        campusId, 
        status, 
        search,
        gender,
        employmentType,
        limit = 50, 
        page = 1 
      } = req.query;
      
      // 🔥 CRITICAL: Build campus filter based on user role
      // This was the MAJOR SECURITY FLAW in the original code
      const filter = buildCampusFilter(req.user, campusId);
      
      // Additional filters
      if (status) filter.status = status;
      if (gender) filter.gender = gender;
      if (employmentType) filter.employmentType = employmentType;
      
      // Search by name, email, username, phone, or qualification
      if (search) {
        filter.$or = [
          { firstName: { $regex: search, $options: 'i' } },
          { lastName: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { username: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } },
          { qualification: { $regex: search, $options: 'i' } }
        ];
      }

      const skip = (Number(page) - 1) * Number(limit);

      // Fetch teachers with populated references
      const teachers = await Teacher.find(filter)
        .select('-password -salary')
        .populate('schoolCampus', 'campus_name location.city')
        .populate('subjects', 'subjectName')
        .populate('classes', 'className')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean();

      const total = await Teacher.countDocuments(filter);

      return sendPaginated(
        res,
        200,
        'Teachers retrieved successfully',
        teachers,
        { total, page, limit }
      );

    } catch (error) {
      console.error('❌ Error fetching teachers:', error);
      return sendError(res, 500, 'Failed to retrieve teachers');
    }
  },

  /**
   * Get a single teacher by ID
   * @route   GET /api/teacher/:id
   * @access  Private
   */
  getOneTeacher: async (req, res) => {
    try {
      const { id } = req.params;

      // Validate ObjectId format
      if (!isValidObjectId(id)) {
        return sendError(res, 400, 'Invalid teacher ID format');
      }

      // Fetch teacher with populated references
      const teacher = await Teacher.findById(id)
        .select('-password -salary')
        .populate('schoolCampus', 'campus_name location')
        .populate('subjects', 'subjectName')
        .populate('classes', 'className level')
        .lean();

      // Check if teacher exists
      if (!teacher) {
        return sendNotFound(res, 'Teacher');
      }

      // Authorization check
      const isOwner = req.user?.id?.toString() === id.toString();
      const isStaff = ['ADMIN', 'CAMPUS_MANAGER', 'DIRECTOR'].includes(req.user?.role);

      if (!isOwner && !isStaff) {
        return sendError(res, 403, 'You are not authorized to view this profile');
      }

      // Additional campus check for CAMPUS_MANAGER
      if (req.user.role === 'CAMPUS_MANAGER') {
        if (teacher.schoolCampus._id.toString() !== req.user.campusId) {
          return sendError(res, 403, 'This teacher does not belong to your campus');
        }
      }

      return sendSuccess(res, 200, 'Teacher retrieved successfully', teacher);

    } catch (error) {
      console.error('❌ Error fetching teacher:', error);
      return sendError(res, 500, 'Failed to retrieve teacher details');
    }
  },

  /**
   * Update teacher information
   * @route   PATCH /api/teacher/:id
   * @access  Private (ADMIN, CAMPUS_MANAGER, DIRECTOR)
   */
  updateTeacher: async (req, res) => {
    try {
      const { id } = req.params;
      
      // Validate ObjectId
      if (!isValidObjectId(id)) {
        return sendError(res, 400, 'Invalid teacher ID format');
      }

      // Handle both JSON and FormData
      const fields = req.fields || req.body;
      const files = req.files || {};
      
      const updates = { ...fields };

      // Prevent password, salary, and campus modification via this route
      delete updates.password;
      delete updates.salary;
      delete updates.schoolCampus; // Campus cannot be changed

      // Check if teacher exists
      const teacher = await Teacher.findById(id);
      if (!teacher) {
        return sendNotFound(res, 'Teacher');
      }

      // Authorization: CAMPUS_MANAGER can only update teachers in their campus
      if (req.user.role === 'CAMPUS_MANAGER') {
        if (teacher.schoolCampus.toString() !== req.user.campusId) {
          return sendError(res, 403, 'You can only update teachers from your own campus');
        }
      } else if (!['ADMIN', 'DIRECTOR'].includes(req.user.role)) {
        return sendError(res, 403, 'You are not authorized to update teachers');
      }

      // Check email uniqueness if being changed
      if (updates.email && updates.email.toLowerCase() !== teacher.email) {
        if (!isValidEmail(updates.email)) {
          return sendError(res, 400, 'Invalid email format');
        }

        const emailExists = await Teacher.findOne({ 
          email: updates.email.toLowerCase(),
          _id: { $ne: id }
        });

        if (emailExists) {
          return sendConflict(res, 'This email is already in use');
        }
      }

      // Check username uniqueness if being changed
      if (updates.username && updates.username.toLowerCase() !== teacher.username) {
        const usernameExists = await Teacher.findOne({ 
          username: updates.username.toLowerCase(),
          _id: { $ne: id }
        });

        if (usernameExists) {
          return sendConflict(res, 'This username is already taken');
        }
      }

      // Validate classes belong to same campus (if being updated)
      if (updates.classes && Array.isArray(updates.classes) && updates.classes.length > 0) {
        const validation = await validateMultipleClassesBelongToCampus(
          updates.classes, 
          teacher.schoolCampus
        );

        if (!validation.valid) {
          return sendError(res, 400, 'Some assigned classes do not belong to the teacher\'s campus');
        }
      }

      // Handle image upload
      const imageFile = files.teacher_image?.[0] || files.teacher_image || files.image?.[0] || files.image;
      
      if (imageFile) {
        try {
          const newImagePath = await replaceFile(
            imageFile,
            TEACHER_FOLDER,
            teacher.teacher_image,
            'teacher'
          );
          updates.teacher_image = newImagePath;
        } catch (uploadError) {
          return sendError(res, 400, uploadError.message);
        }
      }

      // Normalize email and username
      if (updates.email) {
        updates.email = updates.email.toLowerCase().trim();
      }
      if (updates.username) {
        updates.username = updates.username.toLowerCase().trim();
      }

      // Update teacher
      const updatedTeacher = await Teacher.findByIdAndUpdate(
        id, 
        updates, 
        { new: true, runValidators: true }
      )
        .select('-password -salary')
        .populate('schoolCampus', 'campus_name')
        .populate('subjects', 'subjectName')
        .populate('classes', 'className')
        .lean();

      return sendSuccess(res, 200, 'Teacher updated successfully', updatedTeacher);

    } catch (error) {
      console.error('❌ Error updating teacher:', error);
      
      if (error.code === 11000) {
        return handleDuplicateKeyError(res, error);
      }

      if (error.name === 'ValidationError') {
        const messages = Object.values(error.errors).map(err => err.message);
        return sendError(res, 400, 'Validation failed', { errors: messages });
      }

      return sendError(res, 500, 'Failed to update teacher');
    }
  },

  /**
   * Update teacher password
   * @route   PATCH /api/teacher/:id/password
   * @access  Private (Teacher themselves or ADMIN)
   */
  updateTeacherPassword: async (req, res) => {
    try {
      const { id } = req.params;
      const { currentPassword, newPassword } = req.body;

      // Validate ObjectId
      if (!isValidObjectId(id)) {
        return sendError(res, 400, 'Invalid teacher ID format');
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
      const isOwner = req.user?.id?.toString() === id.toString();
      const isAdmin = ['ADMIN', 'CAMPUS_MANAGER', 'DIRECTOR'].includes(req.user?.role);

      if (!isOwner && !isAdmin) {
        return sendError(res, 403, 'You are not authorized to change this password');
      }

      // Fetch teacher with password
      const teacher = await Teacher.findById(id).select('+password');
      if (!teacher) {
        return sendNotFound(res, 'Teacher');
      }

      // Verify current password (skip for ADMIN)
      if (!isAdmin) {
        if (!currentPassword) {
          return sendError(res, 400, 'Current password is required');
        }

        const isMatch = await bcrypt.compare(currentPassword, teacher.password);
        if (!isMatch) {
          return sendError(res, 401, 'Current password is incorrect');
        }
      }

      // Hash new password
      const salt = await bcrypt.genSalt(SALT_ROUNDS);
      teacher.password = await bcrypt.hash(newPassword, salt);

      await teacher.save();

      return sendSuccess(res, 200, 'Password updated successfully');

    } catch (error) {
      console.error('❌ Password update error:', error);
      return sendError(res, 500, 'Failed to update password');
    }
  },

  /**
   * Archive teacher (Soft Delete)
   * @route   DELETE /api/teacher/:id
   * @access  Private (ADMIN, DIRECTOR)
   */
  archiveTeacher: async (req, res) => {
    try {
      const { id } = req.params;

      // Validate ObjectId
      if (!isValidObjectId(id)) {
        return sendError(res, 400, 'Invalid teacher ID format');
      }

      const teacher = await Teacher.findById(id);
      if (!teacher) {
        return sendNotFound(res, 'Teacher');
      }

      // Authorization
      if (req.user.role === 'CAMPUS_MANAGER') {
        if (teacher.schoolCampus.toString() !== req.user.campusId) {
          return sendError(res, 403, 'You can only archive teachers from your own campus');
        }
      }

      // Update status to archived
      teacher.status = 'archived';
      await teacher.save();

      return sendSuccess(res, 200, 'Teacher archived successfully');

    } catch (error) {
      console.error('❌ Error archiving teacher:', error);
      return sendError(res, 500, 'Failed to archive teacher');
    }
  },

  /**
   * Restore archived teacher
   * @route   PATCH /api/teacher/:id/restore
   * @access  Private (ADMIN, DIRECTOR)
   */
  restoreTeacher: async (req, res) => {
    try {
      const { id } = req.params;

      // Validate ObjectId
      if (!isValidObjectId(id)) {
        return sendError(res, 400, 'Invalid teacher ID format');
      }

      const teacher = await Teacher.findById(id);
      if (!teacher) {
        return sendNotFound(res, 'Teacher');
      }

      // Authorization
      if (req.user.role === 'CAMPUS_MANAGER') {
        if (teacher.schoolCampus.toString() !== req.user.campusId) {
          return sendError(res, 403, 'You can only restore teachers from your own campus');
        }
      }

      // Update status to active
      teacher.status = 'active';
      await teacher.save();

      return sendSuccess(res, 200, 'Teacher restored successfully');

    } catch (error) {
      console.error('❌ Error restoring teacher:', error);
      return sendError(res, 500, 'Failed to restore teacher');
    }
  },

  /**
   * Permanently delete teacher
   * @route   DELETE /api/teacher/:id/permanent
   * @access  Private (ADMIN only)
   */
  deleteTeacherPermanently: async (req, res) => {
    try {
      const { id } = req.params;

      // Validate ObjectId
      if (!isValidObjectId(id)) {
        return sendError(res, 400, 'Invalid teacher ID format');
      }

      const teacher = await Teacher.findById(id);
      if (!teacher) {
        return sendNotFound(res, 'Teacher');
      }

      // Delete teacher image if exists
      if (teacher.teacher_image) {
        await deleteFile(TEACHER_FOLDER, teacher.teacher_image);
      }

      // Delete teacher from database
      await Teacher.findByIdAndDelete(id);

      return sendSuccess(res, 200, 'Teacher deleted permanently');

    } catch (error) {
      console.error('❌ Error deleting teacher:', error);
      return sendError(res, 500, 'Failed to delete teacher');
    }
  }
};