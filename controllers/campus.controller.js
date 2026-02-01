require('dotenv').config();

const formidable = require('formidable');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const Campus = require('../models/campus.model');
const Teacher = require('../models/teacher.model');
const Student = require('../models/student.model');
const Class = require('../models/class.model');

const { uploadImage, deleteFile } = require('../utils/fileUpload');
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
  validatePasswordStrength
} = require('../utils/validationHelpers');

// Constants
const JWT_SECRET = process.env.JWT_SECRET;
const CAMPUS_FOLDER = 'campuses';
const SALT_ROUNDS = 10;

module.exports = {

  /**
   * Create a new campus
   * @route   POST /api/campus/create
   * @access  Private (ADMIN, DIRECTOR)
   */
  createCampus: async (req, res) => {
    const form = new formidable.IncomingForm();
    
    form.parse(req, async (err, fields, files) => {
      if (err) {
        console.error('❌ Form parsing error:', err);
        return sendError(res, 400, 'Invalid form data');
      }

      // Start a session for transaction (ensures data consistency)
      const session = await mongoose.startSession();
      session.startTransaction();

      let imagePath = null;
  
      try {
        // Extract and flatten fields
        const email = fields.email?.[0];
        const password = fields.password?.[0];
        const campus_name = fields.campus_name?.[0];
        const manager_name = fields.manager_name?.[0];
        const campus_number = fields.campus_number?.[0];
        const manager_phone = fields.manager_phone?.[0];
        
        const location = {
          address: fields['location[address]']?.[0] || '',
          city: fields['location[city]']?.[0] || '',
          country: fields['location[country]']?.[0] || 'Cameroon',
          coordinates: {
            lat: fields['location[coordinates][lat]']?.[0] 
              ? parseFloat(fields['location[coordinates][lat]'][0]) 
              : null,
            lng: fields['location[coordinates][lng]']?.[0] 
              ? parseFloat(fields['location[coordinates][lng]'][0]) 
              : null,
          }
        };
        
        // Validate required fields
        if (!email || !password || !campus_name || !manager_name || !manager_phone) {
          await session.abortTransaction();
          return sendError(res, 400, 'All required fields must be provided', {
            required: ['email', 'password', 'campus_name', 'manager_name']
          });
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
  
        // Check if email already exists (case-insensitive)
        const existingCampus = await Campus.findOne({ 
          email: email.toLowerCase() 
        }).session(session);
        
        if (existingCampus) {
          await session.abortTransaction();
          return sendConflict(res, 'A campus with this email is already registered');
        }
  
        // Handle image upload
        const imageFile = files.image?.[0] || files.campus_image?.[0];
        
        if (imageFile) {
          try {
            imagePath = await uploadImage(imageFile, CAMPUS_FOLDER, 'campus');
          } catch (uploadError) {
            await session.abortTransaction();
            return sendError(res, 400, uploadError.message);
          }
        }
  
        // Hash password
        const salt = await bcrypt.genSalt(SALT_ROUNDS);
        const hashPassword = await bcrypt.hash(password, salt);
  
        // Create new campus
        const newCampus = new Campus({
          campus_name: campus_name.trim(),
          campus_number: campus_number?.trim(),
          email: email.toLowerCase().trim(),
          manager_name: manager_name.trim(),
          manager_phone: manager_phone?.trim(),
          location,
          password: hashPassword,
          campus_image: imagePath,
        });
  
        await newCampus.save({ session });

        // Commit transaction
        await session.commitTransaction();
        
        // Remove password from response
        const response = newCampus.toObject();
        delete response.password;
  
        return sendCreated(res, 'Campus registered successfully', response);
  
      } catch (error) {
        // Rollback transaction on error
        await session.abortTransaction();
        console.error('❌ Campus creation error:', error);

        //cleaning image if DB fails
        if (imagePath) {
          await deleteFile(CAMPUS_FOLDER, imagePath); 
        } 
        
        
        // Handle MongoDB duplicate key errors
        if (error.code === 11000) {
          return handleDuplicateKeyError(res, error);
        }

        // Handle validation errors
        if (error.name === 'ValidationError') {
          const messages = Object.values(error.errors).map(err => err.message);
          return sendError(res, 400, 'Validation failed', { errors: messages });
        }
  
        return sendError(res, 500, 'Failed to register campus. Please try again');
      } finally {
        session.endSession();
      }
    });
  },

  /**
   * Campus login
   * @route   POST /api/campus/login
   * @access  Public
   */
  loginCampus: async (req, res) => {
    try {
      // Validate request body
      if (!req.body || !req.body.email || !req.body.password) {
        return sendError(res, 400, 'Email and password are required');
      }
  
      const { email, password } = req.body;
  
      // JWT_SECRET verification
      if (!JWT_SECRET) {
        console.error('❌ JWT_SECRET is not defined in environment variables');
        return sendError(res, 500, 'Server configuration error');
      }

      // Validate email format
      if (!isValidEmail(email)) {
        return sendError(res, 400, 'Invalid email format');
      }
  
      // Find campus with password field
      const campus = await Campus.findOne({ 
        email: email.toLowerCase().trim() 
      }).select('+password');
      
      // Generic error message for security
      if (!campus) {
        return sendError(res, 401, 'Invalid email or password');
      }
  
      // Compare password
      const isPasswordValid = await bcrypt.compare(password, campus.password);
  
      if (!isPasswordValid) {
        return sendError(res, 401, 'Invalid email or password');
      }

      // Check campus status
      if (campus.status !== 'active') {
        return sendError(res, 403, 'This campus account is inactive. Please contact support.');
      }
  
      // Generate JWT token
      const token = jwt.sign(
        {
          id: campus._id,
          campusId: campus._id,
          manager_name: campus.manager_name,
          campus_name: campus.campus_name,
          image_url: campus.campus_image,
          role: 'CAMPUS_MANAGER'
        },
        JWT_SECRET,
        { 
          expiresIn: '7d',
          issuer: 'school-management-app',
        }
      );
  
      // Update last login time
      campus.lastLogin = new Date();
      await campus.save();
  
      // Send response
      return sendSuccess(res, 200, 'Login successful', {
        token,
        user: {
          id: campus._id,
          manager_name: campus.manager_name,
          campus_name: campus.campus_name,
          email: campus.email,
          image_url: campus.campus_image,
          role: 'CAMPUS_MANAGER'
        }
      });
  
    } catch (error) {
      console.error('❌ Campus login error:', error);
      return sendError(res, 500, 'Internal server error during login');
    }
  },

  /**
   * Get all campuses with pagination and filters
   * @route   GET /api/campus/all
   * @access  Private (ADMIN, DIRECTOR)
   */
  getAllCampus: async (req, res) => {
    try {
      const { 
        page = 1, 
        limit = 50, 
        search = '',
        status,
        city 
      } = req.query;

      // Build filter
      const filter = {};
      
      if (status) {
        filter.status = status;
      }

      if (city) {
        filter['location.city'] = { $regex: city, $options: 'i' };
      }

      if (search) {
        filter.$or = [
          { campus_name: { $regex: search, $options: 'i' } },
          { manager_name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { campus_number: { $regex: search, $options: 'i' } }
        ];
      }

      const skip = (Number(page) - 1) * Number(limit);

      // Fetch campuses with pagination
      const allCampus = await Campus.find(filter)
        .select('-password')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(); // Use lean() for better performance (returns plain JS objects)

      const total = await Campus.countDocuments(filter);

      return sendPaginated(
        res,
        200,
        'All campuses fetched successfully',
        allCampus,
        { total, page, limit }
      );

    } catch (error) {
      console.error('❌ Error fetching campuses:', error);
      return sendError(res, 500, 'Internal server error while fetching campuses');
    }
  },

  /**
   * Get single campus by ID
   * @route   GET /api/campus/:id
   * @access  Private (CAMPUS_MANAGER can only access own campus, ADMIN/DIRECTOR all)
   */
  getOneCampus: async (req, res) => {
    try {
      const { id } = req.params;
  
      // Validate ObjectId
      if (!isValidObjectId(id)) {
        return sendError(res, 400, 'Invalid campus ID format');
      }

      // Authorization: CAMPUS_MANAGER can only access their own campus
      if (req.user.role === 'CAMPUS_MANAGER' && req.user.campusId !== id) {
        return sendError(res, 403, 'You can only access your own campus');
      }
  
      const campus = await Campus.findById(id).select('-password').lean();
  
      if (!campus) {
        return sendNotFound(res, 'Campus');
      }
  
      return sendSuccess(res, 200, 'Campus fetched successfully', campus);
  
    } catch (error) {
      console.error('❌ getOneCampus error:', error);
      return sendError(res, 500, 'Server error');
    }
  },

  /**
   * Update campus information
   * @route   PUT /api/campus/:id
   * @access  Private (CAMPUS_MANAGER for own campus, ADMIN/DIRECTOR for all)
   */
  updateCampus: async (req, res) => {
    const form = new formidable.IncomingForm();
    
    form.parse(req, async (err, fields, files) => {
      if (err) {
        console.error('❌ Formidable error:', err);
        return sendError(res, 400, 'Error processing the form');
      }
  
      try {
        const id = req.params.id;

        // Validate ObjectId
        if (!isValidObjectId(id)) {
          return sendError(res, 400, 'Invalid campus ID format');
        }
  
        // Check if campus exists
        const campus = await Campus.findById(id);
        if (!campus) {
          return sendNotFound(res, 'Campus');
        }

        // Authorization check
        if (req.user.role === 'CAMPUS_MANAGER') {
          if (req.user.campusId !== id) {
            return sendError(res, 403, 'You can only update your own campus');
          }
        } else if (!['ADMIN', 'DIRECTOR'].includes(req.user.role)) {
          return sendError(res, 403, 'You are not authorized to update campuses');
        }

        // Check email uniqueness if email is being changed
        const newEmail = fields.email?.[0];
        if (newEmail && newEmail.toLowerCase() !== campus.email) {
          if (!isValidEmail(newEmail)) {
            return sendError(res, 400, 'Invalid email format');
          }

          const emailExists = await Campus.findOne({ 
            email: newEmail.toLowerCase(),
            _id: { $ne: id }
          });
          
          if (emailExists) {
            return sendConflict(res, 'This email is already in use by another campus');
          }
        }
  
        // Handle image upload
        const imageFile = files.image?.[0] || files.campus_image?.[0];
        
        if (imageFile) {
          try {
            // Upload new image
            const newImagePath = await uploadImage(imageFile, CAMPUS_FOLDER, 'campus');
            
            // Delete old image if exists
            if (campus.campus_image) {
              await deleteFile(CAMPUS_FOLDER, campus.campus_image);
            }
            
            campus.campus_image = newImagePath;
          } catch (uploadError) {
            return sendError(res, 400, uploadError.message);
          }
        }
  
        // Update allowed fields
        const allowedUpdates = [
          'campus_name', 
          'manager_name', 
          'manager_phone',
          'email', 
          'campus_number'
        ];
        
        allowedUpdates.forEach((field) => {
          const value = fields[field]?.[0];
          if (value !== undefined && value !== null && value !== '') {
            campus[field] = field === 'email' 
              ? value.toLowerCase().trim() 
              : value.trim();
          }
        });

        // Update location if provided
        if (fields['location[address]']?.[0]) {
          campus.location.address = fields['location[address]'][0];
        }
        if (fields['location[city]']?.[0]) {
          campus.location.city = fields['location[city]'][0];
        }
        if (fields['location[country]']?.[0]) {
          campus.location.country = fields['location[country]'][0];
        }
  
        // Save updated campus
        await campus.save();
  
        // Prepare response without password
        const updatedData = campus.toObject();
        delete updatedData.password;
  
        return sendSuccess(res, 200, 'Campus updated successfully', updatedData);
  
      } catch (error) {
        console.error('❌ Error in updateCampus:', error);

        if (error.code === 11000) {
          return handleDuplicateKeyError(res, error);
        }

        if (error.name === 'ValidationError') {
          const messages = Object.values(error.errors).map(err => err.message);
          return sendError(res, 400, 'Validation failed', { errors: messages });
        }

        return sendError(res, 500, 'Error updating campus');
      }
    });
  },

  /**
   * Update campus password
   * @route   PATCH /api/campus/:id/password
   * @access  Private (CAMPUS_MANAGER for own campus, ADMIN)
   */
  updateCampusPassword: async (req, res) => {
    try {
      const { id } = req.params;
      const { currentPassword, newPassword } = req.body;

      // Validate ObjectId
      if (!isValidObjectId(id)) {
        return sendError(res, 400, 'Invalid campus ID format');
      }

      // Validate required fields
      if (!newPassword) {
        return sendError(res, 400, 'New password is required');
      }

      // Validate password strength
      const passwordValidation = validatePasswordStrength(newPassword);
      if (!passwordValidation.valid) {
        return sendError(res, 400, 'Password does not meet requirements', {
          errors: passwordValidation.errors
        });
      }

      // Authorization
      const isOwner = req.user.campusId === id;
      const isAdmin = ['ADMIN', 'DIRECTOR'].includes(req.user.role);

      if (!isOwner && !isAdmin) {
        return sendError(res, 403, 'You are not authorized to change this password');
      }

      // Find campus with password
      const campus = await Campus.findById(id).select('+password');
      if (!campus) {
        return sendNotFound(res, 'Campus');
      }

      // Verify current password (skip for ADMIN)
      if (!isAdmin) {
        if (!currentPassword) {
          return sendError(res, 400, 'Current password is required');
        }

        const isMatch = await bcrypt.compare(currentPassword, campus.password);
        if (!isMatch) {
          return sendError(res, 401, 'Current password is incorrect');
        }
      }

      // Hash new password
      const salt = await bcrypt.genSalt(SALT_ROUNDS);
      campus.password = await bcrypt.hash(newPassword, salt);

      await campus.save();

      return sendSuccess(res, 200, 'Password updated successfully');

    } catch (error) {
      console.error('❌ Password update error:', error);
      return sendError(res, 500, 'Failed to update password');
    }
  },

  /**
   * Archive campus (soft delete)
   * @route   DELETE /api/campus/:id
   * @access  Private (ADMIN, DIRECTOR only)
   */
  deleteCampus: async (req, res) => {
    try {
      const { id } = req.params;

      // Validate ObjectId
      if (!isValidObjectId(id)) {
        return sendError(res, 400, 'Invalid campus ID format');
      }

      const campus = await Campus.findById(id);
      if (!campus) {
        return sendNotFound(res, 'Campus');
      }

      // Soft delete (update status to 'archived')
      campus.status = 'archived';
      await campus.save();

      return sendSuccess(res, 200, 'Campus archived successfully');

    } catch (error) {
      console.error('❌ Error deleting campus:', error);
      return sendError(res, 500, 'Failed to archive campus');
    }
  },

  /**
   * Get campus context with statistics
   * @route   GET /api/campus/:campusId/context
   * @access  Private
   */
  getCampusContext: async (req, res) => {
    try {
      const { campusId } = req.params;

      // Validate ObjectId
      if (!isValidObjectId(campusId)) {
        return sendError(res, 400, 'Invalid campus ID format');
      }

      // Authorization check
      if (req.user.role === 'CAMPUS_MANAGER' && req.user.campusId !== campusId) {
        return sendError(res, 403, 'You can only access your own campus context');
      }
  
      // Parallel queries for better performance
      const [campus, studentsCount, teachersCount, classesCount] = await Promise.all([
        Campus.findById(campusId).select('-password').lean(),
        Student.countDocuments({ schoolCampus: campusId, status: { $ne: 'archived' } }),
        Teacher.countDocuments({ schoolCampus: campusId, status: { $ne: 'archived' } }),
        Class.countDocuments({ campus: campusId, status: { $ne: 'archived' } })
      ]);
  
      if (!campus) {
        return sendNotFound(res, 'Campus');
      }
  
      return sendSuccess(res, 200, 'Campus context fetched successfully', {
        campus,
        stats: {
          students: studentsCount,
          teachers: teachersCount,
          classes: classesCount
        }
      });
    } catch (error) {
      console.error('❌ getCampusContext error:', error);
      return sendError(res, 500, 'Failed to fetch campus context');
    }
  },

  /**
   * Get campus dashboard statistics
   * @route   GET /api/campus/:campusId/dashboard
   * @access  Private (CAMPUS_MANAGER, DIRECTOR, ADMIN)
   */
  getCampusDashboardStats: async (req, res) => {
    try {
      const { campusId } = req.params;

      
      // Validate ObjectId
     if (!mongoose.Types.ObjectId.isValid(campusId)) {
        return sendError(res, 400, 'Invalid campus ID format');
      }

      // Authorization
      if (req.user.role === 'CAMPUS_MANAGER' && req.user.campusId !== campusId) {
        return sendError(res, 403, 'You can only access your own campus dashboard');
      }

      const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

      const [
        studentsTotal,
        teachersTotal,
        classesTotal,
        activeClasses,
        recentStudents,
        recentTeachers
      ] = await Promise.all([
        Student.countDocuments({ schoolCampus: campusId, status: { $ne: 'archived' } }),
        Teacher.countDocuments({ schoolCampus: campusId, status: { $ne: 'archived' } }),
        Class.countDocuments({ campus: campusId, status: { $ne: 'archived' } }),
        Class.countDocuments({ campus: campusId, status: 'active' }),
        Student.countDocuments({
          schoolCampus: campusId,
          createdAt: { $gte: firstDayOfMonth },
          status: { $ne: 'archived' }
        }),
        Teacher.countDocuments({
          schoolCampus: campusId,
          createdAt: { $gte: firstDayOfMonth },
          status: { $ne: 'archived' }
        })
      ]);

      return sendSuccess(res, 200, 'Dashboard statistics fetched successfully', {
        students: {
          total: studentsTotal,
          newThisMonth: recentStudents
        },
        teachers: {
          total: teachersTotal,
          newThisMonth: recentTeachers
        },
        classes: {
          total: classesTotal,
          active: activeClasses
        }
      });

    } catch (error) {
      console.error('❌ Dashboard stats error:', error);
      return sendError(res, 500, 'Failed to load dashboard statistics');
    }
  },

  /**
   * Get students of a campus
   * @route   GET /api/campus/:campusId/students
   * @access  Private
   */
  getCampusStudents: async (req, res) => {
    try {
      const { campusId } = req.params;
      const { page = 1, limit = 20, search = '', classId, status } = req.query;

      // Validate ObjectId
      if (!isValidObjectId(campusId)) {
        return sendError(res, 400, 'Invalid campus ID format');
      }

      // Authorization
      if (req.user.role === 'CAMPUS_MANAGER' && req.user.campusId !== campusId) {
        return sendError(res, 403, 'You can only access students from your own campus');
      }

      const filter = { schoolCampus: campusId };

      if (classId) filter.studentClass = classId;
      if (status) filter.status = status;

      if (search) {
        filter.$or = [
          { firstName: { $regex: search, $options: 'i' } },
          { lastName: { $regex: search, $options: 'i' } },
          { matricule: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ];
      }

      const skip = (Number(page) - 1) * Number(limit);

      const students = await Student.find(filter)
        .populate('studentClass', 'className')
        .select('-password')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean();

      const total = await Student.countDocuments(filter);

      return sendPaginated(
        res,
        200,
        'Students fetched successfully',
        students,
        { total, page, limit }
      );

    } catch (error) {
      console.error('❌ getCampusStudents error:', error);
      return sendError(res, 500, 'Failed to fetch students');
    }
  },

  /**
   * Get teachers of a campus
   * @route   GET /api/campus/:campusId/teachers
   * @access  Private
   */
  getCampusTeachers: async (req, res) => {
    try {
      const { campusId } = req.params;
      const { page = 1, limit = 20, search = '', status } = req.query;

      // Validate ObjectId
      if (!isValidObjectId(campusId)) {
        return sendError(res, 400, 'Invalid campus ID format');
      }

      // Authorization
      if (req.user.role === 'CAMPUS_MANAGER' && req.user.campusId !== campusId) {
        return sendError(res, 403, 'You can only access teachers from your own campus');
      }

      const filter = { schoolCampus: campusId };
      if (status) filter.status = status;

      if (search) {
        filter.$or = [
          { firstName: { $regex: search, $options: 'i' } },
          { lastName: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ];
      }

      const skip = (Number(page) - 1) * Number(limit);

      const teachers = await Teacher.find(filter)
        .select('-password -salary')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean();

      const total = await Teacher.countDocuments(filter);

      return sendPaginated(
        res,
        200,
        'Teachers fetched successfully',
        teachers,
        { total, page, limit }
      );

    } catch (error) {
      console.error('❌ getCampusTeachers error:', error);
      return sendError(res, 500, 'Failed to fetch teachers');
    }
  },

  /**
   * Get classes of a campus
   * @route   GET /api/campus/:campusId/classes
   * @access  Private
   */
  getCampusClasses: async (req, res) => {
    try {
      const { campusId } = req.params;
      const { status } = req.query;

      // Validate ObjectId
      if (!isValidObjectId(campusId)) {
        return sendError(res, 400, 'Invalid campus ID format');
      }

      // Authorization
      if (req.user.role === 'CAMPUS_MANAGER' && req.user.campusId !== campusId) {
        return sendError(res, 403, 'You can only access classes from your own campus');
      }

      const filter = { campus: campusId };
      if (status) filter.status = status;

      const classes = await Class.find(filter)
        .populate('teacher', 'firstName lastName')
        .sort({ className: 1 })
        .lean();

      return sendSuccess(res, 200, 'Classes fetched successfully', classes);

    } catch (error) {
      console.error('❌ getCampusClasses error:', error);
      return sendError(res, 500, 'Failed to fetch classes');
    }
  }
};