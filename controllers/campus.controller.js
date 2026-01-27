require('dotenv').config();

const formidable = require('formidable');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const Campus = require('../models/campus.model');
const { uploadImage, deleteFile } = require('../utils/fileUpload');

// Constants
const JWT_SECRET = process.env.JWT_SECRET;
const CAMPUS_FOLDER = 'campuses'; // Folder for campus images
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
        console.error('Form parsing error:', err);
        return res.status(400).json({ 
          success: false, 
          message: "Invalid form data" 
        });
      }
  
      try {
        // Extract and flatten fields (formidable wraps in arrays)
        const email = fields.email?.[0];
        const password = fields.password?.[0];
        const campus_name = fields.campus_name?.[0];
        const manager_name = fields.manager_name?.[0];
  
        // Validate required fields
        if (!email || !password || !campus_name || !manager_name) {
          return res.status(400).json({ 
            success: false, 
            message: "All fields (email, password, campus_name, manager_name) are required" 
          });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          return res.status(400).json({ 
            success: false, 
            message: "Invalid email format" 
          });
        }

        // Validate password strength
        if (password.length < 8) {
          return res.status(400).json({ 
            success: false, 
            message: "Password must be at least 8 characters long" 
          });
        }
  
        // Check if email already exists (case-insensitive)
        const existingCampus = await Campus.findOne({ 
          email: email.toLowerCase() 
        });
        
        if (existingCampus) {
          return res.status(409).json({ 
            success: false, 
            message: "A campus with this email is already registered" 
          });
        }
  
        // Handle image upload using utility
        let imagePath = null;
        const imageFile = files.image?.[0] || files.campus_image?.[0];
        
        if (imageFile) {
          try {
            imagePath = await uploadImage(imageFile, CAMPUS_FOLDER, 'campus');
          } catch (uploadError) {
            return res.status(400).json({ 
              success: false, 
              message: uploadError.message 
            });
          }
        }
  
        // Hash password
        const salt = await bcrypt.genSalt(SALT_ROUNDS);
        const hashPassword = await bcrypt.hash(password, salt);
  
        // Create new campus
        const newCampus = new Campus({
          campus_name: campus_name.trim(),
          email: email.toLowerCase().trim(),
          manager_name: manager_name.trim(),
          password: hashPassword,
          campus_image: imagePath,
        });
  
        await newCampus.save();
        
        // Remove password from response
        const response = newCampus.toObject();
        delete response.password;
  
        res.status(201).json({ 
          success: true, 
          message: "Campus registered successfully",
          data: response 
        });
  
      } catch (error) {
        console.error('Campus creation error:', error);
        
        // Handle MongoDB duplicate key errors
        if (error.code === 11000) {
          return res.status(409).json({ 
            success: false, 
            message: "Campus with this information already exists" 
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
          message: "Failed to register campus. Please try again" 
        });
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
        return res.status(400).json({
          success: false,
          message: "Email and password are required"
        });
      }
  
      const { email, password } = req.body;
  
      // JWT_SECRET verification
      if (!JWT_SECRET) {
        console.error('❌ JWT_SECRET is not defined in environment variables');
        return res.status(500).json({
          success: false,
          message: "Server configuration error"
        });
      }
  
      // Find campus with password field (excluded by default)
      const campus = await Campus.findOne({ 
        email: email.toLowerCase().trim() 
      }).select('+password');
      
      // Generic error message for security (don't reveal if email exists)
      if (!campus) {
        return res.status(401).json({
          success: false,
          message: "Invalid email or password"
        });
      }
  
      // Compare password
      const isPasswordValid = await bcrypt.compare(password, campus.password);
  
      if (!isPasswordValid) {
        return res.status(401).json({
          success: false,
          message: "Invalid email or password"
        });
      }

      // Check campus status (if you have a status field)
      if (campus.status && campus.status !== 'active') {
        return res.status(403).json({
          success: false,
          message: "This campus account is inactive. Please contact support."
        });
      }
  
      // Generate JWT token
      const token = jwt.sign(
        {
          id: campus._id,
          campusId: campus._id,
          manager_name: campus.manager_name,
          campus_name: campus.campus_name,
          image_url: campus.campus_image,
          role: "CAMPUS_MANAGER"
        },
        JWT_SECRET,
        { 
          expiresIn: '7d',
          issuer: 'school-management-app',
        }
      );
  
      // Update last login time (if you have this field)
      campus.lastLogin = new Date();
      await campus.save();
  
      // Send response
      res.status(200).json({
        success: true,
        message: "Login successful",
        token,
        user: {
          id: campus._id,
          manager_name: campus.manager_name,
          campus_name: campus.campus_name,
          email: campus.email,
          image_url: campus.campus_image,
          role: "CAMPUS_MANAGER"
        }
      });
  
    } catch (error) {
      console.error('❌ Campus login error:', error);
      
      res.status(500).json({
        success: false,
        message: "Internal server error during login"
      });
    }
  },

  /**
   * Get all campuses
   * @route   GET /api/campus/all
   * @access  Public or Private (depending on requirements)
   */
  getAllCampus: async (req, res) => {
    try {
      const { 
        page = 1, 
        limit = 50, 
        search = '',
        status 
      } = req.query;

      // Build filter
      const filter = {};
      
      if (status) {
        filter.status = status;
      }

      if (search) {
        filter.$or = [
          { campus_name: { $regex: search, $options: 'i' } },
          { manager_name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ];
      }

      const skip = (Number(page) - 1) * Number(limit);

      // Fetch campuses with pagination
      const allCampus = await Campus.find(filter)
        .select('-password -manager_email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit));

      const total = await Campus.countDocuments(filter);

      res.status(200).json({
        success: true, 
        message: 'All campuses fetched successfully',
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          pages: Math.ceil(total / Number(limit))
        },
        allCampus
      });

    } catch (error) {
      console.error('❌ Error fetching campuses:', error);
      res.status(500).json({
        success: false,
        message: "Internal server error while fetching campuses"
      });
    }
  },

  /**
   * Get single campus (authenticated user's campus)
   * @route   GET /api/campus/single
   * @access  Private (CAMPUS_MANAGER, DIRECTOR)
   */
  getOneCampus: async (req, res) => {
    try {
      // Get campus ID from authenticated user
      const id = req.user?.id || req.user?.campusId;

      if (!id) {
        return res.status(401).json({
          success: false,
          message: "Authentication required"
        });
      }
      
      // Validate MongoDB ObjectId format
      if (!id.match(/^[0-9a-fA-F]{24}$/)) {
        return res.status(400).json({ 
          success: false, 
          message: 'Invalid campus ID format' 
        });
      }

      // Find campus by ID
      const campus = await Campus.findById(id).select('-password');
      
      // Check if campus exists
      if (!campus) {
        return res.status(404).json({
          success: false,
          message: "Campus not found"
        });
      }
  
      res.status(200).json({
        success: true,
        message: "Campus retrieved successfully",
        data: campus
      });
  
    } catch (error) {
      console.error("❌ Error in getOneCampus:", error);

      // Handle invalid ObjectId format
      if (error.kind === 'ObjectId') {
        return res.status(400).json({ 
          success: false, 
          message: 'Invalid campus ID format' 
        });
      }

      res.status(500).json({
        success: false,
        message: "Server error while retrieving campus"
      });
    }
  },

  /**
   * Update campus information
   * @route   PUT /api/campus/update/:id
   * @access  Private (CAMPUS_MANAGER, DIRECTOR)
   */
  updateCampus: async (req, res) => {
    const form = new formidable.IncomingForm();
    
    form.parse(req, async (err, fields, files) => {
      if (err) {
        console.error("❌ Formidable error:", err);
        return res.status(400).json({ 
          success: false, 
          message: "Error processing the form" 
        });
      }
  
      try {
        // Get ID from params or authenticated user
        const id = req.params.id || req.user?.id;

        if (!id) {
          return res.status(400).json({
            success: false,
            message: "Campus ID is required"
          });
        }

        // Validate ObjectId
        if (!id.match(/^[0-9a-fA-F]{24}$/)) {
          return res.status(400).json({ 
            success: false, 
            message: 'Invalid campus ID format' 
          });
        }
  
        // Check if campus exists
        const campus = await Campus.findById(id);
        if (!campus) {
          return res.status(404).json({ 
            success: false, 
            message: "Campus not found" 
          });
        }

        // Authorization check (user can only update their own campus unless ADMIN)
        if (req.user?.role !== 'ADMIN' && req.user?.role !== 'DIRECTOR') {
          if (req.user?.id !== id && req.user?.campusId !== id) {
            return res.status(403).json({
              success: false,
              message: "You are not authorized to update this campus"
            });
          }
        }

        // Check email uniqueness if email is being changed
        const newEmail = fields.email?.[0];
        if (newEmail && newEmail.toLowerCase() !== campus.email) {
          const emailExists = await Campus.findOne({ 
            email: newEmail.toLowerCase(),
            _id: { $ne: id }
          });
          
          if (emailExists) {
            return res.status(409).json({ 
              success: false, 
              message: 'This email is already in use by another campus' 
            });
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
            return res.status(400).json({ 
              success: false, 
              message: uploadError.message 
            });
          }
        }
  
        // Update allowed fields
        const allowedUpdates = ['campus_name', 'manager_name', 'email'];
        
        allowedUpdates.forEach((field) => {
          const value = fields[field]?.[0];
          if (value !== undefined && value !== null && value !== '') {
            campus[field] = field === 'email' ? value.toLowerCase().trim() : value.trim();
          }
        });
  
        // Save updated campus
        await campus.save();
  
        // Prepare response without password
        const updatedData = campus.toObject();
        delete updatedData.password;
  
        res.status(200).json({
          success: true,
          message: "Campus updated successfully",
          data: updatedData
        });
  
      } catch (error) {
        console.error("❌ Error in updateCampus:", error);

        // Handle MongoDB duplicate key errors
        if (error.code === 11000) {
          return res.status(409).json({ 
            success: false, 
            message: "Campus with this information already exists" 
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
          message: "Error updating campus" 
        });
      }
    });
  },

  /**
   * Update campus password
   * @route   PATCH /api/campus/:id/password
   * @access  Private (CAMPUS_MANAGER, ADMIN)
   */
  updateCampusPassword: async (req, res) => {
    try {
      const { id } = req.params;
      const { currentPassword, newPassword } = req.body;

      // Validate required fields
      if (!currentPassword || !newPassword) {
        return res.status(400).json({
          success: false,
          message: "Current password and new password are required"
        });
      }

      // Validate new password strength
      if (newPassword.length < 8) {
        return res.status(400).json({
          success: false,
          message: "New password must be at least 8 characters long"
        });
      }

      // Authorization: Only the campus manager themselves or ADMIN can change password
      const isOwner = req.user?.id === id || req.user?.campusId === id;
      const isAdmin = ['ADMIN', 'DIRECTOR'].includes(req.user?.role);

      if (!isOwner && !isAdmin) {
        return res.status(403).json({
          success: false,
          message: "You are not authorized to change this password"
        });
      }

      // Find campus with password
      const campus = await Campus.findById(id).select('+password');
      if (!campus) {
        return res.status(404).json({
          success: false,
          message: "Campus not found"
        });
      }

      // Verify current password (skip for ADMIN)
      if (!isAdmin) {
        const isMatch = await bcrypt.compare(currentPassword, campus.password);
        if (!isMatch) {
          return res.status(401).json({
            success: false,
            message: "Current password is incorrect"
          });
        }
      }

      // Hash new password
      const salt = await bcrypt.genSalt(SALT_ROUNDS);
      campus.password = await bcrypt.hash(newPassword, salt);

      await campus.save();

      res.status(200).json({
        success: true,
        message: "Password updated successfully"
      });

    } catch (error) {
      console.error('❌ Password update error:', error);
      res.status(500).json({
        success: false,
        message: "Failed to update password"
      });
    }
  },

  /**
   * Delete/Archive campus
   * @route   DELETE /api/campus/:id
   * @access  Private (ADMIN, DIRECTOR)
   */
  deleteCampus: async (req, res) => {
    try {
      const { id } = req.params;

      // Validate ObjectId
      if (!id.match(/^[0-9a-fA-F]{24}$/)) {
        return res.status(400).json({ 
          success: false, 
          message: 'Invalid campus ID format' 
        });
      }

      const campus = await Campus.findById(id);
      if (!campus) {
        return res.status(404).json({
          success: false,
          message: "Campus not found"
        });
      }

      // Soft delete (update status to 'archived')
      campus.status = 'archived';
      await campus.save();

      res.status(200).json({
        success: true,
        message: "Campus archived successfully"
      });

    } catch (error) {
      console.error('❌ Error deleting campus:', error);
      res.status(500).json({
        success: false,
        message: "Failed to archive campus"
      });
    }
  }
};