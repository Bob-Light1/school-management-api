const jwt = require("jsonwebtoken");

/**
 * JWT authentication middleware with role control
 * @param {Array<string>} roles - List of authorized roles (optional)
 * @returns {Function} Express middleware
 */
const authMiddleware = (roles = []) => {
  return (req, res, next) => {
    try {
      // Extracting the token with the correct format
      const authHeader = req.header("Authorization");
      
      if (!authHeader) {
        return res.status(401).json({
          success: false,
          message: "No token provided. Authorization denied."
        });
      }

      // Correct extraction of the token (with the space)
      const token = authHeader.replace("Bearer ", "").trim();
      
      if (!token) {
        return res.status(401).json({
          success: false,
          message: "Invalid token format. Authorization denied."
        });
      }

      // Checking JWT_SECRET
      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret) {
        console.error("❌ JWT_SECRET is not defined in environment variables");
        return res.status(500).json({
          success: false,
          message: "Server configuration error"
        });
      }

      // Verifying and decoding the token
      const decoded = jwt.verify(token, jwtSecret);
      
      // Adding user information to the request
      req.user = decoded;

      // Checking roles if specified
      if (roles.length > 0) {
        if (!req.user.role) {
          return res.status(403).json({
            success: false,
            message: "User role not found in token"
          });
        }

        if (!roles.includes(req.user.role)) {
          return res.status(403).json({
            success: false,
            message: `Access denied. Required roles: ${roles.join(", ")}`
          });
        }
      }

      // Everything is OK, proceed to the next middleware
      next();

    } catch (error) {
      console.error("❌ Auth middleware error:", error.message);

      // Handling specific JWT errors
      if (error.name === "JsonWebTokenError") {
        return res.status(401).json({
          success: false,
          message: "Invalid token. Authorization denied."
        });
      }

      if (error.name === "TokenExpiredError") {
        return res.status(401).json({
          success: false,
          message: "Token expired. Please login again."
        });
      }

      if (error.name === "NotBeforeError") {
        return res.status(401).json({
          success: false,
          message: "Token not active yet"
        });
      }

      // Generic error
      return res.status(500).json({
        success: false,
        message: "Authentication error occurred"
      });
    }
  };
};

module.exports = authMiddleware;