// CRUD applications - CREATE, READ, UPDATE, DELETE
// AUTHENTICATION - ADMIN, STUDENT, TEACHER, PARENT, PARTNER

require('dotenv').config();
const formidable = require('formidable');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken')

const Campus = require('../models/campus.model');


module.exports = {

  createCampus: async (req, res) => {
    const form = new formidable.IncomingForm();
    
    form.parse(req, async (err, fields, files) => {
      // Error handling for form parsing
      if (err) {
        console.error('Form parsing error:', err);
        return res.status(400).json({ 
          success: false, 
          message: "Invalid form data" 
        });
      }
  
      try {
        // Extract and validate fields
        const email = fields.email?.[0];
        const password = fields.password?.[0];
        const campus_name = fields.campus_name?.[0];
        const manager_name = fields.manager_name?.[0];
  
        // Validate required fields
        if (!email || !password || !campus_name || !manager_name) {
          return res.status(400).json({ 
            success: false, 
            message: "All fields are required" 
          });
        }
  
        // Check if email already exists
        const existingCampus = await Campus.findOne({ email });
        if (existingCampus) {
          return res.status(409).json({ 
            success: false, 
            message: "This email is already registered" 
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
          imagePath = `campus_${timestamp}_${randomString}${extension}`;
          
          const destinationPath = path.join(
            __dirname, 
            "..", 
            process.env.CAMPUS_IMAGE_PATH, 
            imagePath
          );
          
          // Copy file asynchronously
          await fs.promises.copyFile(photo.filepath, destinationPath);
        }
  
        // Hash password asynchronously
        const salt = await bcrypt.genSalt(10);
        const hashPassword = await bcrypt.hash(password, salt);
  
        // Create new campus
        const newCampus = new Campus({
          campus_name,
          email,
          manager_name,
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
        
        // Handle specific MongoDB errors
        if (error.code === 11000) {
          return res.status(409).json({ 
            success: false, 
            message: "Campus with this information already exists" 
          });
        }
  
        res.status(500).json({ 
          success: false, 
          message: "Failed to register campus. Please try again" 
        });
      }
    });
  },

  loginCampus: async (req, res) => {
    try {

      if (!req.body || !req.body.email || !req.body.password) {
        return res.status(400).json({
          success: false,
          message: "Email and password are required"
        });
      }
  
      // Validation of entring data
      const { email, password } = req.body;
  
      if (!email || !password) {
        return res.status(400).json({
          success: false,
          message: "Email and password are required"
        });
      }
  
      // JWT_SECRET verification
      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret) {
        console.error('JWT_SECRET is not defined in environment variables');
        return res.status(500).json({
          success: false,
          message: "Server configuration error"
        });
      }
  
      // Searching campus with select to include the password
      const campus = await Campus.findOne({ 
        email: email.toLowerCase() 
      }).select('+password');
      
       // Validate credentials
      if (!campus) {
        return res.status(401).json({
          success: false,
          message: "Invalid credentials" // Message générique
        });
      }
  
      // Compare password
      const isAuth = await bcrypt.compare(password, campus.password);
  
      if (!isAuth) {
        return res.status(401).json({
          success: false,
          message: "Invalid credentials"
        });
      }
  
      // Generating expiring token
      const token = jwt.sign(
        {
          id: campus._id,
          campusId: campus._id,
          manager_name: campus.manager_name,
          campus_name: campus.campus_name,
          image_url: campus.campus_image,
          role: "CAMPUS_MANAGER"
        },
        jwtSecret,
        { 
          expiresIn: '7d', // expires after 7 days
          issuer: 'school-management-app',
        }
      );
  
      // Sending token in the body and the header
      res.header("Authorization", `Bearer ${token}`); // Standar format
  
      res.status(200).json({
        success: true,
        message: "Login successful",
        token, //Token in the body
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
      // details Log
      console.error('Campus login error:', error);
      
      res.status(500).json({
        success: false,
        message: "Internal server error during login"
      });
    }
  },


  getAllCampus: async(req, res) => {
    try {
      const allCampus = await Campus.find().select(['-password', '-manager_email', '-createdAt']);
      res.status(200).json({
        success:true, 
        message: 'fetched all Campuses successfully',
        allCampus
      })
    } catch (error) {
      res.status(500).json({
        success:false,
        message: "Internal Server Error while fetching [All CAMPUSES DATA]"
      });
    };
  },


  getOneCampus: async (req, res) => {
    try {
      const id = req.user.id;
      
      // Validate MongoDB ObjectId format
      if (!id.match(/^[0-9a-fA-F]{24}$/)) {
        return res.status(400).json({ 
          success: false, 
          message: 'Invalid campus ID format' 
        });
      }

      // findById is more direct and clear than findOne({_id:id})
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
      console.error("Error in get-One-Campus:", error);

      // Handle invalid ObjectId format
      if (error.kind === 'ObjectId') {
        return res.status(400).json({ 
          success: false, 
          message: 'Invalid campus ID format' 
        });
      }

      res.status(500).json({
        success: false,
        message: "Server error while retrieving the campus"
      });
    }
  },


  updateCampus: async (req, res) => {
    const form = new formidable.IncomingForm();
    
    form.parse(req, async (err, fields, files) => {
      if (err) {
        console.error("Formidable error:", err);
        return res.status(400).json({ 
          success: false, 
          message: "Error processing the form" 
        });
      }
  
      try {
        const id = req.user.id;
        const updates = req.body;

        // Prevent password modification via this route (use dedicated route)
        delete updates.password;

       
  
        // Check if campus exists
        const campus = await Campus.findById(id);
        if (!campus) {
          return res.status(404).json({ 
            success: false, 
            message: "Campus not found" 
          });
        }

         // Check email uniqueness if email is being changed
      if (updates.email && updates.email.toLowerCase() !== campus.email) {
        const emailExists = await campus.findOne({ 
          email: updates.email.toLowerCase() 
        });
        if (emailExists) {
          return res.status(409).json({ 
            success: false, 
            message: 'This email is already in use' 
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
  
          const newFileName = `campus_${id}_${Date.now()}${extension}`;
          const newPath = path.join(__dirname, process.env.CAMPUS_IMAGE_PATH, newFileName);
  
          // Delete old image
          if (campus.campus_image) {
            const oldImagePath = path.join(__dirname, process.env.CAMPUS_IMAGE_PATH, campus.campus_image);
            if (fs.existsSync(oldImagePath)) {
              fs.unlinkSync(oldImagePath);
            }
          }
  
          fs.copyFileSync(photo.filepath, newPath);
          campus.campus_image = newFileName;
        }
  
        // Updating fields
        const allowedUpdates = ['campus_name', 'manager_name', 'email'];
        
        Object.keys(fields).forEach((key) => {
          if (allowedUpdates.includes(key) && fields[key][0]) {
            campus[key] = fields[key][0];
          }
        });
  
        await campus.save();
  
        const updatedData = campus.toObject();
        delete updatedData.password;
  
        res.status(200).json({
          success: true,
          message: "Campus successfully updated",
          updatedCampus: updatedData
        });
  
      } catch (error) {
        console.error("Error in updateCampus:", error);
        res.status(500).json({ 
          success: false, 
          message: "Error during saving" 
        });
      }
    });
  }
};