module.exports = (allowedRoles = []) => {
  return (req, res, next) => {
    const userRoles = req.user?.roles || [];

    const hasAccess = allowedRoles.some(role =>
      userRoles.includes(role)
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
      });
    }

    next();
  };
};
