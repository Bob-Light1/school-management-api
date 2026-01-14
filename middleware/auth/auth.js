const jwt = require("jsonwebtoken");

/**
 * Middleware d'authentification JWT avec contrôle de rôles
 * @param {Array<string>} roles - Liste des rôles autorisés (optionnel)
 * @returns {Function} Middleware Express
 */
const authMiddleware = (roles = []) => {
  return (req, res, next) => {
    try {
      // ✅ 1. Extraction du token avec le bon format
      const authHeader = req.header("Authorization");
      
      if (!authHeader) {
        return res.status(401).json({
          success: false,
          message: "No token provided. Authorization denied."
        });
      }

      // ✅ 2. Extraction correcte du token (avec l'espace)
      const token = authHeader.replace("Bearer ", "").trim();
      
      if (!token) {
        return res.status(401).json({
          success: false,
          message: "Invalid token format. Authorization denied."
        });
      }

      // ✅ 3. Vérification de JWT_SECRET
      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret) {
        console.error("❌ JWT_SECRET is not defined in environment variables");
        return res.status(500).json({
          success: false,
          message: "Server configuration error"
        });
      }

      // ✅ 4. Vérification et décodage du token
      const decoded = jwt.verify(token, jwtSecret);
      
      // ✅ 5. Ajout des informations utilisateur à la requête
      req.user = decoded;

      // ✅ 6. Vérification des rôles si spécifiés
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

      // ✅ 7. Tout est OK, passer au middleware suivant
      next();

    } catch (error) {
      console.error("❌ Auth middleware error:", error.message);

      // ✅ 8. Gestion des erreurs spécifiques JWT
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

      // ✅ 9. Erreur générique
      return res.status(500).json({
        success: false,
        message: "Authentication error occurred"
      });
    }
  };
};

module.exports = authMiddleware;