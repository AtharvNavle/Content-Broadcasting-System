export const roleMiddleware = (allowedRole) => {
  return (req, res, next) => {
    if (req.user.role !== allowedRole) {
      return res.status(403).json({ message: "Access denied" });
    }
    next();
  };
};
