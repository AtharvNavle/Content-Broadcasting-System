import { registerUser, loginUser } from "../services/authService.js";

export const register = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password || !role) {
      return res
        .status(400)
        .json({ message: "Name, email, password and role are required" });
    }

    if (!["teacher", "principal"].includes(role)) {
      return res
        .status(400)
        .json({ message: "Role must be teacher or principal" });
    }

    const user = await registerUser(name, email, password, role);

    return res.status(201).json({
      message: "User registered successfully",
      user,
    });
  } catch (error) {
    if (error.message === "Email already registered") {
      return res.status(409).json({ message: error.message });
    }
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Email and password are required" });
    }

    const token = await loginUser(email, password);

    return res.json({
      message: "Login successful",
      token,
    });
  } catch (error) {
    if (error.message === "Invalid credentials") {
      return res.status(401).json({
        message: error.message,
      });
    }

    return res.status(500).json({
      message: "Internal server error",
    });
  }
};