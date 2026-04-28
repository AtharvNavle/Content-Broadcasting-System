import express from "express";
import { getCurrentUser } from "../controllers/userController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: User profile
 */

/**
 * @swagger
 * /users/me:
 *   get:
 *     summary: Get current logged-in user info
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Returns current user id and role
 *       401:
 *         description: No token or invalid token
 */
router.get("/me", authMiddleware, getCurrentUser);

export default router;
