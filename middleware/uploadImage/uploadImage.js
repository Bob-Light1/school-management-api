const multer = require('multer');
const path = require('path');
const fs = require('fs');

/**
 * Factory multer middleware
 * @param {String} role - STUDENT | TEACHER | ADMIN | CAMPUS | ...
 */
const uploadImage = (role) => {

  if (!role) {
    throw new Error('Role is required for uploadImage middleware');
  }

  const ENV_PATH_KEY = `${role.toUpperCase()}_IMAGE_PATH`;
  const uploadDir = process.env[ENV_PATH_KEY];

  if (!uploadDir) {
    throw new Error(`Missing ${ENV_PATH_KEY} in .env`);
  }

  // Ensure upload directory exists
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadDir);
    },

    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const uniqueName = `${role.toLowerCase()}_${Date.now()}_${Math.round(
        Math.random() * 1e9
      )}${ext}`;
      cb(null, uniqueName);
    },
  });

  const fileFilter = (req, file, cb) => {
    const allowedMimeTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
    ];

    if (!allowedMimeTypes.includes(file.mimetype)) {
      return cb(
        new Error('Invalid file type. Only JPG, PNG, and WEBP are allowed'),
        false
      );
    }

    cb(null, true);
  };

  return multer({
    storage,
    fileFilter,
    limits: {
      fileSize: 5 * 1024 * 1024, // 5MB
    },
  });
};

module.exports = uploadImage;
