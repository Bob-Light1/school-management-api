require('dotenv').config();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const Teacher = require('../models/teacher.model');
const { uploadImage, deleteFile, replaceFile } = require('../utils/fileUpload');

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
    try {
      // Handle both JSON and FormData
      const fields = req.fields || req.body;
      const files = req.files || {};

      const { email, username, password, ...rest } = fields;

      // Validate required fields
      if (!email || !password) {
        return res.status(400).json({ 
          success: false, 
          message: 'Email and password are required' 
        });
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ 
          success: false, 
          message: 'Invalid email format' 
        });
      }

      // Validate password strength
      if (password.length < 8) {
        return res.status(400).json({ 
          success: false, 
          message: 'Password must be at least 8 characters long' 
        });
      }

      // Check email uniqueness
      const existingEmail = await Teacher.findOne({ 
        email: email.toLowerCase().trim() 
      });
      
      if (existingEmail) {
        return res.status(409).json({ 
          success: false, 
          message: 'A teacher with this email is already registered' 
        });
      }

      // Check username uniqueness if provided
      if (username) {
        const existingUser = await Teacher.findOne({ 
          username: username.toLowerCase().trim() 
        });
        
        if (existingUser) {
          return res.status(409).json({ 
            success: false, 
            message: 'This username is already taken' 
          });
        }
      }

      // Handle image upload using utility
      let teacher_image = null;
      const imageFile = files.teacher_image?.[0] || files.teacher_image || files.image?.[0] || files.image;
      
      if (imageFile) {
        try {
          teacher_image = await uploadImage(imageFile, TEACHER_FOLDER, 'teacher');
        } catch (uploadError) {
          return res.status(400).json({ 
            success: false, 
            message: uploadError.message 
          });
        }
      }

      // Hash password
      const salt = await bcrypt.genSalt(SALT_ROUNDS);
      const hashedPassword = await bcrypt.hash(password, salt);

      // Create new teacher with normalized data
      const teacherData = { 
        ...rest, 
        email: email.toLowerCase().trim(), 
        username: username ? username.toLowerCase().trim() : undefined,
        password: hashedPassword 
      };

      // Add teacher image if uploaded
      if (teacher_image) {
        teacherData.teacher_image = teacher_image;
      }

      const teacher = new Teacher(teacherData);
      const savedTeacher = await teacher.save();

      // Populate references for response
      const populatedTeacher = await Teacher.findById(savedTeacher._id)
        .select('-password -salary')
        .populate('schoolCampus', 'campus_name')
        .populate('subjects', 'subjectName')
        .populate('classes', 'className');

      res.status(201).json({
        success: true,
        message: 'Teacher created successfully',
        data: populatedTeacher
      });

    } catch (error) {
      console.error('❌ Error creating teacher:', error);
      
      // Handle MongoDB duplicate key errors
      if (error.code === 11000) {
        const field = Object.keys(error.keyPattern)[0];
        return res.status(409).json({ 
          success: false, 
          message: `This ${field} is already registered` 
        });
      }

      // Handle validation errors
      if (error.name === 'ValidationError') {
        const messages = Object.values(error.errors).map(err => err.message);
        return res.status(400).json({ 
          success: false, 
          message: messages.join(', ') 
        });
      }

      res.status(500).json({ 
        success: false, 
        message: 'Failed to create teacher. Please try again',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
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
        return res.status(400).json({ 
          success: false, 
          message: 'Email and password are required' 
        });
      }

      // JWT_SECRET verification
      if (!JWT_SECRET) {
        console.error('❌ JWT_SECRET is not defined in environment variables');
        return res.status(500).json({
          success: false,
          message: "Server configuration error"
        });
      }

      // Find teacher with password field
      const teacher = await Teacher.findOne({ 
        email: email.toLowerCase().trim() 
      }).select('+password');

      // Generic error message for security
      if (!teacher) {
        return res.status(401).json({ 
          success: false, 
          message: 'Invalid email or password' 
        });
      }

      // Compare password
      const isPasswordValid = await bcrypt.compare(password, teacher.password);
      if (!isPasswordValid) {
        return res.status(401).json({ 
          success: false, 
          message: 'Invalid email or password' 
        });
      }

      // Check account status
      if (teacher.status !== 'active') {
        return res.status(403).json({ 
          success: false, 
          message: 'Account is inactive or suspended. Please contact support' 
        });
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

      res.status(200).json({
        success: true,
        message: 'Login successful',
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
      res.status(500).json({ 
        success: false, 
        message: 'Internal server error during login' 
      });
    }
  },

  /**
   * Get all teachers with filters and pagination
   * @route   GET /api/teacher
   * @access  Private (ADMIN, CAMPUS_MANAGER, DIRECTOR)
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
      
      // Build filter object
      const filter = {};
      if (campusId) filter.schoolCampus = campusId;
      if (status) filter.status = status;
      if (gender) filter.gender = gender;
      if (employmentType) filter.employmentType = employmentType;
      
      // Search by name, email, username, or phone
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
        .populate('schoolCampus', 'campus_name city')
        .populate('subjects', 'subjectName')
        .populate('classes', 'className')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit));

      const total = await Teacher.countDocuments(filter);

      res.status(200).json({
        success: true,
        message: 'Teachers retrieved successfully',
        pagination: { 
          total, 
          page: Number(page), 
          limit: Number(limit), 
          pages: Math.ceil(total / Number(limit)) 
        },
        data: teachers
      });

    } catch (error) {
      console.error('❌ Error fetching teachers:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to retrieve teachers' 
      });
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

      // Validate MongoDB ObjectId format
      if (!id.match(/^[0-9a-fA-F]{24}$/)) {
        return res.status(400).json({ 
          success: false, 
          message: 'Invalid teacher ID format' 
        });
      }

      // Fetch teacher with populated references
      const teacher = await Teacher.findById(id)
        .select('-password -salary')
        .populate('schoolCampus', 'campus_name city')
        .populate('subjects', 'subjectName')
        .populate('classes', 'className level');

      // Check if teacher exists
      if (!teacher) {
        return res.status(404).json({ 
          success: false, 
          message: 'Teacher not found' 
        });
      }

      // Authorization check
      const isOwner = req.user?.id?.toString() === id.toString();
      const isStaff = ['ADMIN', 'CAMPUS_MANAGER', 'DIRECTOR'].includes(req.user?.role);

      if (!isOwner && !isStaff) {
        return res.status(403).json({ 
          success: false, 
          message: 'You are not authorized to view this profile' 
        });
      }

      res.status(200).json({
        success: true,
        data: teacher
      });

    } catch (error) {
      console.error('❌ Error fetching teacher:', error);
      
      if (error.kind === 'ObjectId') {
        return res.status(400).json({ 
          success: false, 
          message: 'Invalid teacher ID format' 
        });
      }

      res.status(500).json({ 
        success: false, 
        message: 'Failed to retrieve teacher details' 
      });
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
      
      // Handle both JSON and FormData
      const fields = req.fields || req.body;
      const files = req.files || {};
      
      const updates = { ...fields };

      // Validate ObjectId
      if (!id.match(/^[0-9a-fA-F]{24}$/)) {
        return res.status(400).json({ 
          success: false, 
          message: 'Invalid teacher ID format' 
        });
      }

      // Prevent password and salary modification via this route
      delete updates.password;
      delete updates.salary;

      // Check if teacher exists
      const teacher = await Teacher.findById(id);
      if (!teacher) {
        return res.status(404).json({ 
          success: false, 
          message: 'Teacher not found' 
        });
      }

      // Check email uniqueness if email is being changed
      if (updates.email && updates.email.toLowerCase() !== teacher.email) {
        const emailExists = await Teacher.findOne({ 
          email: updates.email.toLowerCase(),
          _id: { $ne: id }
        });
        if (emailExists) {
          return res.status(409).json({ 
            success: false, 
            message: 'This email is already in use' 
          });
        }
      }

      // Check username uniqueness if username is being changed
      if (updates.username && updates.username.toLowerCase() !== teacher.username) {
        const usernameExists = await Teacher.findOne({ 
          username: updates.username.toLowerCase(),
          _id: { $ne: id }
        });
        if (usernameExists) {
          return res.status(409).json({ 
            success: false, 
            message: 'This username is already taken' 
          });
        }
      }

      // Handle image upload using utility
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
          return res.status(400).json({ 
            success: false, 
            message: uploadError.message 
          });
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
        .populate('classes', 'className');

      res.status(200).json({
        success: true,
        message: 'Teacher updated successfully',
        data: updatedTeacher
      });

    } catch (error) {
      console.error('❌ Error updating teacher:', error);
      
      if (error.code === 11000) {
        const field = Object.keys(error.keyPattern)[0];
        return res.status(409).json({ 
          success: false, 
          message: `This ${field} is already in use` 
        });
      }

      if (error.name === 'ValidationError') {
        const messages = Object.values(error.errors).map(err => err.message);
        return res.status(400).json({ 
          success: false, 
          message: messages.join(', ') 
        });
      }

      res.status(500).json({ 
        success: false, 
        message: 'Failed to update teacher',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  },

  /**
   * Update teacher password
   * @route   PATCH /api/teacher/:id/password
   * @access  Private - Teacher themselves or ADMIN
   */
  updateTeacherPassword: async (req, res) => {
    try {
      const { id } = req.params;
      const { currentPassword, newPassword } = req.body;

      // Validate required fields
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ 
          success: false, 
          message: 'Current password and new password are required' 
        });
      }

      // Validate new password strength
      if (newPassword.length < 8) {
        return res.status(400).json({ 
          success: false, 
          message: 'New password must be at least 8 characters long' 
        });
      }

      // Authorization
      const isOwner = req.user?.id?.toString() === id.toString();
      const isAdmin = ['ADMIN', 'CAMPUS_MANAGER', 'DIRECTOR'].includes(req.user?.role);

      if (!isOwner && !isAdmin) {
        return res.status(403).json({ 
          success: false, 
          message: 'You are not authorized to change this password' 
        });
      }

      // Fetch teacher with password field
      const teacher = await Teacher.findById(id).select('+password');
      if (!teacher) {
        return res.status(404).json({ 
          success: false, 
          message: 'Teacher not found' 
        });
      }

      // Verify current password (skip for ADMIN)
      if (!isAdmin) {
        const isMatch = await bcrypt.compare(currentPassword, teacher.password);
        if (!isMatch) {
          return res.status(401).json({ 
            success: false, 
            message: 'Current password is incorrect' 
          });
        }
      }

      // Hash new password
      const salt = await bcrypt.genSalt(SALT_ROUNDS);
      teacher.password = await bcrypt.hash(newPassword, salt);

      await teacher.save();

      res.status(200).json({
        success: true,
        message: 'Password updated successfully'
      });

    } catch (error) {
      console.error('❌ Password update error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to update password' 
      });
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

      const teacher = await Teacher.findByIdAndUpdate(
        id,
        { status: 'archived' },
        { new: true }
      ).select('-password -salary');

      if (!teacher) {
        return res.status(404).json({ 
          success: false, 
          message: 'Teacher not found' 
        });
      }

      res.status(200).json({
        success: true,
        message: 'Teacher archived successfully',
        data: teacher
      });

    } catch (error) {
      console.error('❌ Error archiving teacher:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to archive teacher' 
      });
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

      const teacher = await Teacher.findByIdAndUpdate(
        id,
        { status: 'active' },
        { new: true }
      ).select('-password -salary');

      if (!teacher) {
        return res.status(404).json({ 
          success: false, 
          message: 'Teacher not found' 
        });
      }

      res.status(200).json({
        success: true,
        message: 'Teacher restored successfully',
        data: teacher
      });

    } catch (error) {
      console.error('❌ Error restoring teacher:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to restore teacher' 
      });
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

      const teacher = await Teacher.findById(id);
      if (!teacher) {
        return res.status(404).json({ 
          success: false, 
          message: 'Teacher not found' 
        });
      }

      // Delete teacher image if exists
      if (teacher.teacher_image) {
        await deleteFile(TEACHER_FOLDER, teacher.teacher_image);
      }

      // Delete teacher from database
      await Teacher.findByIdAndDelete(id);

      res.status(200).json({
        success: true,
        message: 'Teacher deleted permanently'
      });

    } catch (error) {
      console.error('❌ Error deleting teacher:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to delete teacher' 
      });
    }
  }
};