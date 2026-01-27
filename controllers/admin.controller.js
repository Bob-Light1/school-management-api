require('dotenv').config();

const formidable = require('formidable');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const Admin = require('../models/admin.model');

// Constants
const JWT_SECRET = process.env.JWT_SECRET;
const SALT_ROUNDS = 10;

module.exports = {

  /**
   * Create a new admin
   * @route   POST /api/admin/create
   * @access  Private (ADMIN, DIRECTOR)
   */
  createAdmin: async (req, res) => {
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
        const admin_name = fields.admin_name?.[0];
  
        // Validate required fields
        if (!email || !password || !admin_name ) {
          return res.status(400).json({ 
            success: false, 
            message: "All fields (email, password, admin_name ) are required" 
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
        const existingAdmin = await Admin.findOne({ 
          email: email.toLowerCase() 
        });
        
        if (existingAdmin) {
          return res.status(409).json({ 
            success: false, 
            message: "A admin with this email is already registered" 
          });
        }

        // Hash password
        const salt = await bcrypt.genSalt(SALT_ROUNDS);
        const hashPassword = await bcrypt.hash(password, salt);
  
        // Create new admin
        const newAdmin = new Admin({
          admin_name: admin_name.trim(),
          email: email.toLowerCase().trim(),
          password: hashPassword,
        });
  
        await newAdmin.save();
        
        // Remove password from response
        const response = newAdmin.toObject();
        delete response.password;
  
        res.status(201).json({ 
          success: true, 
          message: "Admin registered successfully",
          data: response 
        });
  
      } catch (error) {
        console.error('Admin creation error:', error);
        
        // Handle MongoDB duplicate key errors
        if (error.code === 11000) {
          return res.status(409).json({ 
            success: false, 
            message: "Admin with this information already exists" 
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
          message: "Failed to register admin. Please try again" 
        });
      }
    });
  },

  /**
   * admin login
   * @route   POST /api/admin/login
   * @access  Public
   */
  loginAdmin: async (req, res) => {
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
  
      // Find admin with password field (excluded by default)
      const admin = await Admin.findOne({ 
        email: email.toLowerCase().trim() 
      }).select('+password');
      
      // Generic error message for security (don't reveal if email exists)
      if (!admin) {
        return res.status(401).json({
          success: false,
          message: "Invalid email or password"
        });
      }
  
      // Compare password
      const isPasswordValid = await bcrypt.compare(password, admin.password);
  
      if (!isPasswordValid) {
        return res.status(401).json({
          success: false,
          message: "Invalid email or password"
        });
      }
  
      // Generate JWT token
      const token = jwt.sign(
        {
          id: admin._id,
          adminId: admin._id,
          admin_name: admin.admin_name,
          role: "ADMIN"
        },
        JWT_SECRET,
        { 
          expiresIn: '7d',
          issuer: 'school-management-app',
        }
      );
  
      // Update last login time (if you have this field)
      admin.lastLogin = new Date();
      await admin.save();
  
      // Send response
      res.status(200).json({
        success: true,
        message: "Login successful",
        token,
        user: {
          id: admin._id,
          admin_name: admin.admin_name,
          email: admin.email,
          role: "ADMIN"
        }
      });
  
    } catch (error) {
      console.error('❌ Admin login error:', error);
      
      res.status(500).json({
        success: false,
        message: "Internal server error during login"
      });
    }
  },
};