const jwt = require("jsonwebtoken");

/**
 * JWT authentication middleware
 * Verifies the token and attaches user info to req.user
 */
const authenticate = (req, res, next) => {
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
    // const token = authHeader.replace("Bearer ", "").trim();

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return res.status(401).json({ message: "Format de jeton invalide" });
    }

    const token = parts[1];
    
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

/**
 * Role-based authorization middleware
 * Must be used AFTER authenticate middleware
 * @param {Array<string>} allowedRoles - List of authorized roles
 */
const authorize = (allowedRoles = []) => {
  return (req, res, next) => {
    try {
      // Ensure user is authenticated first
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Authentication required. Please login first."
        });
      }

      // If no roles specified, allow all authenticated users
      if (!allowedRoles || allowedRoles.length === 0) {
        return next();
      }

      // Check if user has a role
      if (!req.user.role) {
        return res.status(403).json({
          success: false,
          message: "User role not found. Access denied."
        });
      }

      // Check if user's role is in the allowed roles
      if (!allowedRoles.includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          message: `Access denied. Required roles: ${allowedRoles.join(", ")}. Your role: ${req.user.role}`
        });
      }

      // Authorization successful
      next();

    } catch (error) {
      console.error("❌ Authorization error:", error.message);
      return res.status(500).json({
        success: false,
        message: "Authorization error occurred"
      });
    }
  };
};

/**
 * Combined authentication and authorization middleware (legacy support)
 * For backward compatibility with old code
 * @param {Array<string>} roles - List of authorized roles (optional)
 */
const authMiddleware = (roles = []) => {
  return (req, res, next) => {
    // First authenticate
    authenticate(req, res, (authError) => {
      // If authenticate returned an error response, stop here
      if (authError) {
        return;
      }
      
      // Then authorize if roles are specified
      if (roles && roles.length > 0) {
        const authorizeFn = authorize(roles);
        return authorizeFn(req, res, next);
      }
      
      // No roles specified, just continue
      next();
    });
  };
};

/**
 * Optional authentication middleware
 * Attaches user info if token is valid, but doesn't require it
 */
const optionalAuth = (req, res, next) => {
  try {
    const authHeader = req.header("Authorization");
    
    if (!authHeader) {
      return next();
    }

    //const token = authHeader.replace("Bearer ", "").trim();
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return next();
    }

    const token = parts[1];
    
    if (!token) {
      return next();
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error("❌ JWT_SECRET is not defined");
      return next();
    }

    const decoded = jwt.verify(token, jwtSecret);
    req.user = decoded;
    
    next();

  } catch (error) {
    console.log("ℹ️ Optional auth failed (continuing anyway):", error.message);
    next();
  }
};

/**
 * Middleware to check if user is accessing their own resource
 * @param {string} paramName - Name of the route parameter containing the resource ID
 */
const isOwner = (paramName = 'id') => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Authentication required"
        });
      }

      const resourceId = String(req.params[paramName]); 
      const userId = String(req.user.id);

      if (resourceId !== userId) {
        return res.status(403).json({
          success: false,
          message: "You can only access your own resources"
        });
      }

      next();

    } catch (error) {
      console.error("❌ Ownership check error:", error.message);
      return res.status(500).json({
        success: false,
        message: "Authorization error occurred"
      });
    }
  };
};

/**
 * Middleware to check if user is owner OR has specific roles
 * @param {string} paramName - Name of the route parameter
 * @param {Array<string>} allowedRoles - Roles that can bypass ownership check
 */
const isOwnerOrRole = (paramName = 'id', allowedRoles = ['ADMIN']) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Authentication required"
        });
      }

      const resourceId = req.params[paramName];
      const userId = req.user.id;
      const userRole = req.user.role;

      const isResourceOwner = resourceId === userId;
      const hasPrivilegedRole = allowedRoles.includes(userRole);

      if (!isResourceOwner && !hasPrivilegedRole) {
        return res.status(403).json({
          success: false,
          message: `Access denied. You must be the owner or have one of these roles: ${allowedRoles.join(", ")}`
        });
      }

      next();

    } catch (error) {
      console.error("❌ Owner/Role check error:", error.message);
      return res.status(500).json({
        success: false,
        message: "Authorization error occurred"
      });
    }
  };
};

// Named exports - INCLUDE authMiddleware here!
module.exports = {
  authenticate,
  authorize,
  authMiddleware,
  optionalAuth,
  isOwner,
  isOwnerOrRole
};