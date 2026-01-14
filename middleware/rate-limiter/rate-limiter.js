const rateLimit = require('express-rate-limit');

/**
 * Rate limiter pour les tentatives de connexion
 * 5 tentatives par 15 minutes
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Maximum 5 tentatives
  standardHeaders: true, // Retourne les infos dans `RateLimit-*` headers
  legacyHeaders: false, // Désactive les headers `X-RateLimit-*`
  
  // Handler personnalisé pour la réponse
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: 'Too many login attempts. Please try again in 15 minutes.',
      retryAfter: Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000) // en secondes
    });
  },
  
  // Skip les requêtes réussies (optionnel)
  skipSuccessfulRequests: false,
  
  // Skip les requêtes échouées (optionnel)
  skipFailedRequests: false
  
  // ✅ Pas besoin de keyGenerator - express-rate-limit gère automatiquement les IP (IPv4 et IPv6)
});

/**
 * Rate limiter pour les requêtes API générales
 * 100 requêtes par 15 minutes
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Maximum 100 requêtes
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
 * Rate limiter strict pour les opérations sensibles
 * 3 tentatives par heure (création de compte, reset password, etc.)
 */
const strictLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 heure
  max: 3, // Maximum 3 tentatives
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
 * Rate limiter pour les uploads de fichiers
 * 10 uploads par heure
 */
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 heure
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
  
  // Skip si le fichier est trop gros (géré par multer)
  skip: (req) => {
    return req.fileTooLarge === true;
  }
});

/**
 * Rate limiter personnalisable
 * @param {number} windowMinutes - Fenêtre de temps en minutes
 * @param {number} maxRequests - Nombre maximum de requêtes
 * @param {string} customMessage - Message personnalisé
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