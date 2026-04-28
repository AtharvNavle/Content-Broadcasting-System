export const getCurrentUser = (req, res) => {
  return res.json({
    id: req.user.userId,
    role: req.user.role,
  });
};
