// student.controller.js
require('dotenv').config();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');

const Student = require('../models/student.model');

const JWT_SECRET = process.env.JWT_SECRET;

module.exports = {

  /**
   * Create a new student
   * @route   POST /api/students
   * @access  Private (ADMIN, CAMPUS_MANAGER) - Handled by middleware
   */
  createStudent: async (req, res) => {
    try {
      const { email, username, password, ...rest } = req.body;

      // Validate required fields
      if (!email || !username || !password) {
        return res.status(400).json({ 
          success: false, 
          message: 'Email, username, and password are required' 
        });
      }

      // Validate password strength (minimum 8 characters)
      if (password.length < 8) {
        return res.status(400).json({ 
          success: false, 
          message: 'Password must be at least 8 characters long' 
        });
      }

      // Check email uniqueness (case-insensitive)
      const existingEmail = await Student.findOne({ 
        email: email.toLowerCase() 
      });
      if (existingEmail) {
        return res.status(409).json({ 
          success: false, 
          message: 'This email is already registered' 
        });
      }

      // Check username uniqueness (case-insensitive)
      const existingUser = await Student.findOne({ 
        username: username.toLowerCase() 
      });
      if (existingUser) {
        return res.status(409).json({ 
          success: false, 
          message: 'This username is already taken' 
        });
      }

      // Handle image upload securely
      let imagePath = "";
      if (files.image?.[0]) {
        const photo = files.image[0];
        const extension = path.extname(photo.originalFilename).toLowerCase();
        
        // Validate file type
        const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
        if (!allowedExtensions.includes(extension)) {
          return res.status(400).json({ 
            success: false, 
            message: "Invalid image format. Only JPG, PNG, and WEBP allowed" 
          });
        }

        // Validate file size (e.g., 5MB max)
        if (photo.size > 5 * 1024 * 1024) {
          return res.status(400).json({ 
            success: false, 
            message: "Image too large. Maximum 5MB allowed" 
          });
        }

        // Generate unique filename
        const timestamp = Date.now();
        const randomString = Math.random().toString(36).substring(7);
        imagePath = `student_${timestamp}_${randomString}${extension}`;
        
        const destinationPath = path.join(
          __dirname, 
          "..", 
          process.env.STUDENT_IMAGE_PATH, 
          imagePath
        );
        
        // Copy file asynchronously
        await fs.promises.copyFile(photo.filepath, destinationPath);
      }

      // Hash password asynchronously
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      // Create new student with normalized email and username
      const student = new Student({ 
        ...rest, 
        email: email.toLowerCase(), 
        username: username.toLowerCase(), 
        password: hashedPassword 
      });

      const savedStudent = await student.save();

      // Remove password from response for security
      const responseData = savedStudent.toObject();
      delete responseData.password;

      res.status(201).json({
        success: true,
        message: 'Student created successfully',
        data: responseData
      });

    } catch (error) {
      console.error('Error creating student:', error);
      
      // Handle MongoDB duplicate key errors
      if (error.code === 11000) {
        const field = Object.keys(error.keyPattern)[0];
        return res.status(409).json({ 
          success: false, 
          message: `This ${field} is already registered` 
        });
      }

      res.status(500).json({ 
        success: false, 
        message: 'Failed to create student. Please try again' 
      });
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
        return res.status(400).json({ 
          success: false, 
          message: 'Email and password are required' 
        });
      }

     // JWT_SECRET verification
      if (!JWT_SECRET) {
        console.error('JWT_SECRET is not defined in environment variables');
        return res.status(500).json({
          success: false,
          message: "Server configuration error"
        });
      }

      // Find student with password field
        const student = await Student.findOne({ 
        email: email.toLowerCase() 
      }).select('+password');

      // Validate credentials
      if (!student) {
        return res.status(401).json({ 
          success: false, 
          message: 'Invalid credentials' 
        });
      }

      // Compare password
      const isPasswordValid = await bcrypt.compare(password, student.password);
      if (!isPasswordValid) {
        return res.status(401).json({ 
          success: false, 
          message: 'Invalid credentials' 
        });
      }

      // Check account status
      if (student.status !== 'active') {
        return res.status(403).json({ 
          success: false, 
          message: 'Account is inactive or suspended. Please contact support' 
        });
      }

     // Generating expiring token
      const token = jwt.sign(
        { 
          id: student._id, 
          role: 'STUDENT', 
          name: `${student.firstName} ${student.lastName}` 
        },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      res.status(200).json({
        success: true,
        message: 'Login successful',
        token,
        user: {
          id: student._id,
          name: `${student.firstName} ${student.lastName}`,
          email: student.email,
          username: student.username,
          phone: student.phone,
          role: 'STUDENT'
        }
      });

    } catch (error) {
      console.error('Student login error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Internal server error during login' 
      });
    }
  },

  /**
   * Get all students with filters and pagination
   * @route   GET /api/students
   * @access  Private (ADMIN, CAMPUS_MANAGER, TEACHER) - Handled by middleware
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
      
      // Build filter object
      const filter = {};
      if (campusId) filter.schoolCampus = campusId;
      if (classId) filter.studentClass = classId;
      if (status) filter.status = status;
      
      // Search by name, email, or username
      if (search) {
        filter.$or = [
          { firstName: { $regex: search, $options: 'i' } },
          { lastName: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { username: { $regex: search, $options: 'i' } }
        ];
      }

      const skip = (Number(page) - 1) * Number(limit);

      // Fetch students with populated references
      const students = await Student.find(filter)
        .select('-password')
        .populate('studentClass', 'className level')
        .populate('mentor', 'firstName lastName email')
        .populate('schoolCampus', 'campus_name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit));

      const total = await Student.countDocuments(filter);

      res.status(200).json({
        success: true,
        message: 'Students retrieved successfully',
        pagination: { 
          total, 
          page: Number(page), 
          limit: Number(limit), 
          pages: Math.ceil(total / Number(limit)) 
        },
        data: students
      });

    } catch (error) {
      console.error('Error fetching students:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to retrieve students' 
      });
    }
  },

  /**
   * Get a single student by ID
   * @route   GET /api/students/:id
   * @access  Private - Staff can view all, students can view only themselves
   */
  getOneStudent: async (req, res) => {
    try {
      const { id } = req.params;

      // Validate MongoDB ObjectId format
      if (!id.match(/^[0-9a-fA-F]{24}$/)) {
        return res.status(400).json({ 
          success: false, 
          message: 'Invalid student ID format' 
        });
      }

      // Fetch student with populated references
      const student = await Student.findById(id)
        .select('-password')
        .populate('schoolCampus', 'campus_name city')
        .populate({
          path: 'studentClass',
          select: 'className level',
          populate: { path: 'level', select: 'name' }
        })
        .populate('mentor', 'firstName lastName email');

      // Check if student exists
      if (!student) {
        return res.status(404).json({ 
          success: false, 
          message: 'Student not found' 
        });
      }

      // Authorization: Students can only view their own profile
      // Staff (ADMIN, CAMPUS_MANAGER, TEACHER) can view any profile
      const isOwner = req.user.id === id;
      const isStaff = ['ADMIN', 'CAMPUS_MANAGER', 'TEACHER'].includes(req.user.role);

      if (!isOwner && !isStaff) {
        return res.status(403).json({ 
          success: false, 
          message: 'You are not authorized to view this profile' 
        });
      }

      res.status(200).json({
        success: true,
        data: student
      });

    } catch (error) {
      console.error('Error fetching student:', error);
      
      // Handle invalid ObjectId format
      if (error.kind === 'ObjectId') {
        return res.status(400).json({ 
          success: false, 
          message: 'Invalid student ID format' 
        });
      }

      res.status(500).json({ 
        success: false, 
        message: 'Failed to retrieve student details' 
      });
    }
  },

  /**
   * Update student information
   * @route   PATCH /api/students/:id
   * @access  Private (ADMIN, CAMPUS_MANAGER) - Handled by middleware
   */
  updateStudent: async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      // Prevent password modification via this route (use dedicated route)
      delete updates.password;

      // Check if student exists
      const student = await Student.findById(id);
      if (!student) {
        return res.status(404).json({ 
          success: false, 
          message: 'Student not found' 
        });
      }

      // Check email uniqueness if email is being changed
      if (updates.email && updates.email.toLowerCase() !== student.email) {
        const emailExists = await Student.findOne({ 
          email: updates.email.toLowerCase() 
        });
        if (emailExists) {
          return res.status(409).json({ 
            success: false, 
            message: 'This email is already in use' 
          });
        }
      }

      // Check username uniqueness if username is being changed
      if (updates.username && updates.username.toLowerCase() !== student.username) {
        const usernameExists = await Student.findOne({ 
          username: updates.username.toLowerCase() 
        });
        if (usernameExists) {
          return res.status(409).json({ 
            success: false, 
            message: 'This username is already taken' 
          });
        }
      }


       // Image handling
      if (files.image?.[0]) {
        const photo = files.image[0];
        const extension = path.extname(photo.originalFilename).toLowerCase();
        
      // Image type validation
      const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
      if (!allowedExtensions.includes(extension)) {
        return res.status(400).json({ 
          success: false, 
          message: "Unauthorized image format" 
        });
      }

      // Size validation (e.g., 5MB max)
      if (photo.size > 5 * 1024 * 1024) {
        return res.status(400).json({ 
          success: false, 
          message: "Image too large (max 5MB)" 
        });
      }

      const newFileName = `student_${id}_${Date.now()}${extension}`;
      const newPath = path.join(__dirname, process.env.STUDENT_IMAGE_PATH, newFileName);

      // Delete old image
      if (student.student_image) {
        const oldImagePath = path.join(__dirname, process.env.STUDENT_IMAGE_PATH, student.student_image);
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      }

      fs.copyFileSync(photo.filepath, newPath);
      student.student_image = newFileName;
    }

      // Update student with normalized email and username
      const updatedStudent = await Student.findByIdAndUpdate(
        id, 
        { 
          ...updates, 
          email: updates.email?.toLowerCase(), 
          username: updates.username?.toLowerCase() 
        }, 
        { new: true, runValidators: true }
      ).select('-password');

      res.status(200).json({
        success: true,
        message: 'Student updated successfully',
        data: updatedStudent
      });

    } catch (error) {
      console.error('Error updating student:', error);
      
      // Handle MongoDB duplicate key errors
      if (error.code === 11000) {
        const field = Object.keys(error.keyPattern)[0];
        return res.status(409).json({ 
          success: false, 
          message: `This ${field} is already in use` 
        });
      }

      res.status(500).json({ 
        success: false, 
        message: 'Failed to update student' 
      });
    }
  },

  /**
   * Update student password
   * @route   PATCH /api/students/:id/password
   * @access  Private - Student themselves or ADMIN
   */
  updateStudentPassword: async (req, res) => {
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

      // Authorization: Only the student themselves or an ADMIN can change password
      const isOwner = req.user.id === id;
      const isAdmin = ['ADMIN', 'CAMPUS_MANAGER'].includes(req.body.role);

      if (!isOwner && !isAdmin) {
        return res.status(403).json({ 
          success: false, 
          message: 'You are not authorized to change this password' 
        });
      }

      // Fetch student with password field
      const student = await Student.findById(id).select('+password');
      if (!student) {
        return res.status(404).json({ 
          success: false, 
          message: 'Student not found' 
        });
      }

      // Verify current password (skip for ADMIN)
      if (!isAdmin) {
        const isMatch = await bcrypt.compare(currentPassword, student.password);
        if (!isMatch) {
          return res.status(401).json({ 
            success: false, 
            message: 'Current password is incorrect' 
          });
        }
      }

      // Hash new password
      const salt = await bcrypt.genSalt(10);
      student.password = await bcrypt.hash(newPassword, salt);

      await student.save();

      res.status(200).json({
        success: true,
        message: 'Password updated successfully'
      });

    } catch (error) {
      console.error('Password update error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to update password' 
      });
    }
  },

  /**
   * Archive student (Soft Delete)
   * @route   DELETE /api/students/:id
   * @access  Private (ADMIN, CAMPUS_MANAGER) - Handled by middleware
   */
  archiveStudent: async (req, res) => {
    try {
      const { id } = req.params;

      // Update student status to archived
      const student = await Student.findByIdAndUpdate(
        id,
        { status: 'archived' },
        { new: true }
      ).select('-password');

      if (!student) {
        return res.status(404).json({ 
          success: false, 
          message: 'Student not found' 
        });
      }

      res.status(200).json({
        success: true,
        message: 'Student archived successfully',
        data: student
      });

    } catch (error) {
      console.error('Error archiving student:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to archive student' 
      });
    }
  },

  /**
   * Restore archived student
   * @route   PATCH /api/students/:id/restore
   * @access  Private (ADMIN, CAMPUS_MANAGER) - Handled by middleware
   */
  restoreStudent: async (req, res) => {
    try {
      const { id } = req.params;

      // Update student status to active
      const student = await Student.findByIdAndUpdate(
        id,
        { status: 'active' },
        { new: true }
      ).select('-password');

      if (!student) {
        return res.status(404).json({ 
          success: false, 
          message: 'Student not found' 
        });
      }

      res.status(200).json({
        success: true,
        message: 'Student restored successfully',
        data: student
      });

    } catch (error) {
      console.error('Error restoring student:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to restore student' 
      });
    }
  }
};