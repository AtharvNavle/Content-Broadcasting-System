import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

import { pool } from "../utils/db.js";

const JWT_SECRET = process.env.JWT_SECRET || "change_me_in_env";

export const registerUser = async (name, email, password, role) => {
  const existing = await pool.query(
    "SELECT id FROM users WHERE email = $1",
    [email]
  );
  if (existing.rows.length > 0) {
    throw new Error("Email already registered");
  }

  const password_hash = await bcrypt.hash(password, 10);

  const result = await pool.query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, email, role, created_at`,
    [name, email, password_hash, role]
  );

  return result.rows[0];
};

export const loginUser = async (email, password) => {
  const result = await pool.query(
    "SELECT id, role, password_hash FROM users WHERE email = $1",
    [email]
  );

  const user = result.rows[0];

  if (!user) {
    throw new Error("Invalid credentials");
  }

  const isMatch = await bcrypt.compare(password, user.password_hash);

  if (!isMatch) {
    throw new Error("Invalid credentials");
  }

  const token = jwt.sign(
    {
      userId: user.id,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  return token;
};