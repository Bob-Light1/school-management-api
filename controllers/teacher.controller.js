// teacher.controller.js
require('dotenv').config();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');

const teacher = require('../models/teacher.model');

const JWT_SECRET = process.env.JWT_SECRET;

module.exports = {

  /**
   * Create a new teacher
   * @route   POST /api/teachers
   * @access  Private (ADMIN, CAMPUS_MANAGER) - Handled by middleware
   */
  createTeacher: async (req, res) => {
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
      const existingEmail = await teacher.findOne({ 
        email: email.toLowerCase() 
      });
      if (existingEmail) {
        return res.status(409).json({ 
          success: false, 
          message: 'This email is already registered' 
        });
      }

      // Check username uniqueness (case-insensitive)
      const existingUser = await teacher.findOne({ 
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
        imagePath = `teacher_${timestamp}_${randomString}${extension}`;
        
        const destinationPath = path.join(
          __dirname, 
          "..", 
          process.env.TEACHER_IMAGE_PATH, 
          imagePath
        );
        
        // Copy file asynchronously
        await fs.promises.copyFile(photo.filepath, destinationPath);
      }
        

      // Hash password asynchronously
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      // Create new teacher with normalized email and username
      const teacher = new teacher({ 
        ...rest, 
        email: email.toLowerCase(), 
        username: username.toLowerCase(), 
        password: hashedPassword 
      });

      const savedteacher = await teacher.save();

      // Remove password from response for security
      const responseData = savedteacher.toObject();
      delete responseData.password;

      res.status(201).json({
        success: true,
        message: 'Teacher created successfully',
        data: responseData
      });

    } catch (error) {
      console.error('Error creating teacher:', error);
      
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
        message: 'Failed to create teacher. Please try again' 
      });
    }
  },

  /**
   * teacher login
   * @route   POST /api/teachers/login
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
         console.error('JWT_SECRET is not defined in environment variables');
         return res.status(500).json({
           success: false,
           message: "Server configuration error"
         });
       }

      // Find teacher with password field 
      const teacher = await teacher.findOne({ 
        email: email.toLowerCase() 
      }).select('+password');

      // Validate credentials
      if (!teacher) {
        return res.status(401).json({ 
          success: false, 
          message: 'Invalid credentials' 
        });
      }

      // Compare password
      const isPasswordValid = await bcrypt.compare(password, teacher.password);
      if (!isPasswordValid) {
        return res.status(401).json({ 
          success: false, 
          message: 'Invalid credentials' 
        });
      }

      // Check account status
      if (teacher.status !== 'active') {
        return res.status(403).json({ 
          success: false, 
          message: 'Account is inactive or suspended. Please contact support' 
        });
      }

      // Generating expiring token
      const token = jwt.sign(
        { 
          id: teacher._id, 
          roles: 'TEACHER', 
          name: `${teacher.firstName} ${teacher.lastName}`,
          qualification:teacher.qualification,
          phone:teacher.phone,
          image_url: teacher.teacher_image,

        },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      res.status(200).json({
        success: true,
        message: 'Login successful',
        token,
        user: {
          id: teacher._id,
          name: `${teacher.firstName} ${teacher.lastName}`,
          email: teacher.email,
          username: teacher.username,
          qualification:teacher.qualification,
          phone:teacher.phone,
          role: 'TEACHER'
        }
      });

    } catch (error) {
      console.error('teacher login error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Internal server error during login' 
      });
    }
  },

  /**
   * Get all teachers with filters and pagination
   * @route   GET /api/teachers
   * @access  Private (ADMIN, CAMPUS_MANAGER, TEACHER) - Handled by middleware
   */
  getAllTeachers: async (req, res) => {
    try {
      const { 
        campusId,
        status,
        qualification, 
        search,
        limit = 50, 
        page = 1 
      } = req.query;
      
      // Build filter object
      const filter = {};
      if (campusId) filter.schoolCampus = campusId;
      if (status) filter.status = status;
      if (qualification) filter.qualification = qualification;
      
      // Search by name, email, or username
      if (search) {
        filter.$or = [
          { firstName: { $regex: search, $options: 'i' } },
          { lastName: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { username: { $regex: search, $options: 'i' } },
          { qualification: { $regex: search, $options: 'i' } }
        ];
      }

      const skip = (Number(page) - 1) * Number(limit);

      // Fetch teachers with populated references
      const teachers = await teacher.find(filter)
        .select('-password')
        .populate('schoolCampus', 'campus_name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit));

      const total = await teacher.countDocuments(filter);

      res.status(200).json({
        success: true,
        message: 'teachers retrieved successfully',
        pagination: { 
          total, 
          page: Number(page), 
          limit: Number(limit), 
          pages: Math.ceil(total / Number(limit)) 
        },
        data: teachers
      });

    } catch (error) {
      console.error('Error fetching teachers:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to retrieve teachers' 
      });
    }
  },

  /**
   * Get a single teacher by ID
   * @route   GET /api/teachers/:id
   * @access  Private - Staff can view all, teachers can view only themselves
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
      const teacher = await teacher.findById(id)
        .select('-password')
        .populate('schoolCampus', 'campus_name city')

      // Check if teacher exists
      if (!teacher) {
        return res.status(404).json({ 
          success: false, 
          message: 'teacher not found' 
        });
      }

      // Authorization: teachers can only view their own profile
      // Staff (ADMIN, CAMPUS_MANAGER, TEACHER) can view any profile
      const isOwner = req.user.id === id;
      const isStaff = ['ADMIN', 'DIRECTOR', 'CAMPUS_MANAGER', 'TEACHER'].includes(req.user.role);

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
      console.error('Error fetching teacher:', error);
      
      // Handle invalid ObjectId format
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
   * @route   PATCH /api/teachers/:id
   * @access  Private (ADMIN, CAMPUS_MANAGER) - Handled by middleware
   */
  updateTeacher: async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      // Prevent password modification via this route (use dedicated route)
      delete updates.password;

      // Check if teacher exists
      const teacher = await teacher.findById(id);
      if (!teacher) {
        return res.status(404).json({ 
          success: false, 
          message: 'teacher not found' 
        });
      }

      // Check email uniqueness if email is being changed
      if (updates.email && updates.email.toLowerCase() !== teacher.email) {
        const emailExists = await teacher.findOne({ 
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
      if (updates.username && updates.username.toLowerCase() !== teacher.username) {
        const usernameExists = await teacher.findOne({ 
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

        const newFileName = `teacher_${id}_${Date.now()}${extension}`;
        const newPath = path.join(__dirname, process.env.TEACHER_IMAGE_PATH, newFileName);

        // Delete old image
        if (teacher.teacher_image) {
          const oldImagePath = path.join(__dirname, process.env.TEACHER_IMAGE_PATH, teacher.teacher_image);
          if (fs.existsSync(oldImagePath)) {
            fs.unlinkSync(oldImagePath);
          }
        }

        fs.copyFileSync(photo.filepath, newPath);
       teacher.teacher_image = newFileName;
      }

      // Update teacher with normalized email and username
      const updatedteacher = await teacher.findByIdAndUpdate(
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
        message: 'Teacher updated successfully',
        data: updatedteacher
      });

    } catch (error) {
      console.error('Error updating teacher:', error);
      
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
        message: 'Failed to update teacher' 
      });
    }
  },

  /**
   * Update teacher password
   * @route   PATCH /api/teachers/:id/password
   * @access  Private - teacher themselves or ADMIN
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

      // Authorization: Only the teacher themselves or an ADMIN can change password
      const isOwner = req.user.id === id;
      const isAdmin = ['ADMIN', 'CAMPUS_MANAGER'].includes(req.body.role);

      if (!isOwner && !isAdmin) {
        return res.status(403).json({ 
          success: false, 
          message: 'You are not authorized to change this password' 
        });
      }

      // Fetch teacher with password field
      const teacher = await teacher.findById(id).select('+password');
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
      const salt = await bcrypt.genSalt(10);
      teacher.password = await bcrypt.hash(newPassword, salt);

      await teacher.save();

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
   * Archive teacher (Soft Delete)
   * @route   DELETE /api/teachers/:id
   * @access  Private (ADMIN, CAMPUS_MANAGER) - Handled by middleware
   */
  archiveTeacher: async (req, res) => {
    try {
      const { id } = req.params;

      // Update teacher status to archived
      const teacher = await teacher.findByIdAndUpdate(
        id,
        { status: 'archived' },
        { new: true }
      ).select('-password');

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
      console.error('Error archiving teacher:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to archive teacher' 
      });
    }
  },

  /**
   * Restore archived teacher
   * @route   PATCH /api/teachers/:id/restore
   * @access  Private (ADMIN, CAMPUS_MANAGER) - Handled by middleware
   */
  restoreTeacher: async (req, res) => {
    try {
      const { id } = req.params;

      // Update teacher status to active
      const teacher = await teacher.findByIdAndUpdate(
        id,
        { status: 'active' },
        { new: true }
      ).select('-password');

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
      console.error('Error restoring teacher:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to restore teacher' 
      });
    }
  }
};