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

  createCampus: async(req, res) => {
    try {
      
      const form = new formidable.IncomingForm();

      form.parse(req, async(err, fields, files) => {
        const campus = await Campus.findOne({ email: fields.email[0]});
        if(campus){
          return res.status(409).json({
            success: false,
            message: " This email is already registered."
          });
        } else {

        
        const photo = files.image[0];
        let filepath = photo.filepath;
        let originalFilename = photo.originalFilename.replace(" ", "_");
        let newPath = path.join(
          __dirname, 
          process.env.SCHOOL_CAMPUS_IMAGE_PATH, 
          originalFilename
        );
  
        let photoData = fs.readFileSync(filepath);
        fs.writeFileSync(newPath, photoData);
  
        const salt = bcrypt.genSaltSync(10);
        const hashPassword = bcrypt.hashSync(fields.password[0], salt);
        const newCampus = new Campus({
          campus_name:fields.campus_name[0],
          email: fields.email[0],
          manager_name:fields.manager_name[0],
          password:hashPassword,
          campus_image:originalFilename,
        })
  
        const savedCampus = await newCampus.save();
        res.status(200).json({
          success: true,
          massage: "New campus is registered successfully in database !",
          data: savedCampus
        });

      };
      })

    } catch (error) {
      res.status(500).json({
        success:false, 
        message: "Campus registration failed !"
      })
    }
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
  
      // 3. Searching campus with select to include the password
      const campus = await Campus.findOne({ email }).select('+password');
      
      // 4. combine verification
      if (!campus) {
        return res.status(401).json({
          success: false,
          message: "Invalid credentials" // Message générique
        });
      }
  
      // 5. Compare password
      const isAuth = await bcrypt.compare(password, campus.password);
  
      if (!isAuth) {
        return res.status(401).json({
          success: false,
          message: "Invalid credentials" // Message générique
        });
      }
  
      // 6. Generating expiring token
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
      // 8. details Log
      console.error('Campus login error:', error);
      
      res.status(500).json({
        success: false,
        message: "Internal server error during login"
      });
    }
  },


  getAllCampus: async(req, res) => {
    try {
      const Allcampus = await Campus.find().select(['-password', '-_id', '-manager_email', '-createdAt']);
      res.status(200).json({
        success:true, 
        message: 'fetched all Campuses successfully',
        Allcampus
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
      
      // findById is more direct and clear than findOne({_id:id})
      const campus = await Campus.findById(id).select('-password');
      
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
      console.error("Error in get-One-Campus:", error); // Added logging
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
        const campus = await Campus.findById(id);
  
        if (!campus) {
          return res.status(404).json({ 
            success: false, 
            message: "Campus not found" 
          });
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
          const newPath = path.join(__dirname, process.env.SCHOOL_CAMPUS_IMAGE_PATH, newFileName);
  
          // Delete old image
          if (campus.campus_image) {
            const oldImagePath = path.join(__dirname, process.env.SCHOOL_CAMPUS_IMAGE_PATH, campus.campus_image);
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