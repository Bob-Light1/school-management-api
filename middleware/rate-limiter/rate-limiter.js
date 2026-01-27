const rateLimit = require('express-rate-limit');

/**
 * Rate limiter for login attempts
 * 5 attempts per 15 minutes
 */

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Maximum 5 attempts
  standardHeaders: true, // Returns information in `RateLimit-*` headers
  legacyHeaders: false, // Disables `X-RateLimit-*` headers
  
  // Custom handler for the response
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: 'Too many login attempts. Please try again in 15 minutes.',
      retryAfter: Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000) // in seconds
    });
  },
  
  // Skip successful requests (optional)
  skipSuccessfulRequests: false,
  
  // Skip failed requests (optional)
  skipFailedRequests: false
});

/**
 * Rate limiter for general API requests
 * 100 requests per 15 minutes
 */

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Maximum 100 requests
  standardHeaders: true,
  legacyHeaders: false,
  
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: 'Too many requests from this IP. Please try again later.',
      retryAfter: Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000)
    });
  }
});

/**
 * Strict rate limiter for sensitive operations
 * 3 attempts per hour (account creation, password reset, etc.)
 */
const strictLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Maximum 3 attempts
  standardHeaders: true,
  legacyHeaders: false,
  
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: 'Too many attempts. Please try again in 1 hour.',
      retryAfter: Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000)
    });
  }
});

/**
 * Rate limiter for file uploads
 * 10 uploads per hour
 */

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Maximum 10 uploads
  standardHeaders: true,
  legacyHeaders: false,
  
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: 'Too many file uploads. Please try again later.',
      retryAfter: Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000)
    });
  },
  
  // Skip if the file is too large (handled by multer)
  skip: (req) => {
    return req.fileTooLarge === true;
  }
});

/**
 * Customizable rate limiter
 * @param {number} windowMinutes - Time window in minutes
 * @param {number} maxRequests - Maximum number of requests
 * @param {string} customMessage - Custom message
 */
const createCustomLimiter = (windowMinutes, maxRequests, customMessage = null) => {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    max: maxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    
    handler: (req, res) => {
      res.status(429).json({
        success: false,
        message: customMessage || `Too many requests. Maximum ${maxRequests} requests per ${windowMinutes} minutes.`,
        retryAfter: Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000)
      });
    }
  });
};

module.exports = {
  loginLimiter,
  apiLimiter,
  strictLimiter,
  uploadLimiter,
  createCustomLimiter
};