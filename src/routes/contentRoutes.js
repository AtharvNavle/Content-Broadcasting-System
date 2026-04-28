import express from "express";
import {
  uploadContent,
  getMyContent,
  getAllContent,
  upsertContentSchedule,
  getPendingContent,
  approveContent,
  rejectContent,
  getLiveContent,
} from "../controllers/contentController.js";

import { authMiddleware } from "../middlewares/authMiddleware.js";
import { roleMiddleware } from "../middlewares/roleMiddleware.js";
import { upload } from "../middlewares/uploadMiddleware.js";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Content
 *   description: Content upload, approval, scheduling and live broadcasting
 */

/**
 * @swagger
 * /content/upload:
 *   post:
 *     summary: Upload content (teacher only)
 *     tags: [Content]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [title, subject, file]
 *             properties:
 *               title:
 *                 type: string
 *                 example: Algebra Quiz
 *               subject:
 *                 type: string
 *                 example: maths
 *               description:
 *                 type: string
 *                 example: Weekly test
 *               start_time:
 *                 type: string
 *                 format: date-time
 *                 example: "2026-04-27T09:00:00"
 *               end_time:
 *                 type: string
 *                 format: date-time
 *                 example: "2026-04-27T11:00:00"
 *               rotation_duration:
 *                 type: integer
 *                 example: 5
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Content uploaded successfully
 *       400:
 *         description: Missing required fields or invalid file
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied (not a teacher)
 */
router.post(
  "/upload",
  authMiddleware,
  roleMiddleware("teacher"),
  upload.single("file"),
  uploadContent
);

/**
 * @swagger
 * /content/my:
 *   get:
 *     summary: Get content uploaded by current teacher (with filters and pagination)
 *     tags: [Content]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: subject
 *         schema:
 *           type: string
 *         description: Filter by subject (e.g. maths)
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, approved, rejected]
 *         description: Filter by content status
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Results per page (max 100)
 *     responses:
 *       200:
 *         description: Paginated list of teacher's content
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied (not a teacher)
 */
router.get("/my", authMiddleware, roleMiddleware("teacher"), getMyContent);

/**
 * @swagger
 * /content/{id}/schedule:
 *   post:
 *     summary: Set or update rotation schedule for content (teacher only)
 *     tags: [Content]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Content ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [duration]
 *             properties:
 *               duration:
 *                 type: integer
 *                 example: 5
 *                 description: Duration in minutes
 *               rotation_order:
 *                 type: integer
 *                 example: 1
 *                 description: Optional position in rotation
 *     responses:
 *       200:
 *         description: Schedule saved
 *       400:
 *         description: Invalid duration
 *       403:
 *         description: Access denied
 *       404:
 *         description: Content not found
 */
router.post(
  "/:id/schedule",
  authMiddleware,
  roleMiddleware("teacher"),
  upsertContentSchedule
);

/**
 * @swagger
 * /content/all:
 *   get:
 *     summary: Get all content with filters and pagination (principal only)
 *     tags: [Content]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: subject
 *         schema:
 *           type: string
 *         description: Filter by subject (e.g. maths)
 *       - in: query
 *         name: teacher
 *         schema:
 *           type: integer
 *         description: Filter by teacher user ID
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, approved, rejected]
 *         description: Filter by content status
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Results per page (max 100)
 *     responses:
 *       200:
 *         description: Paginated list of all content
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied (not a principal)
 */
router.get(
  "/all",
  authMiddleware,
  roleMiddleware("principal"),
  getAllContent
);

/**
 * @swagger
 * /content/pending:
 *   get:
 *     summary: Get pending content with filters and pagination (principal only)
 *     tags: [Content]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: subject
 *         schema:
 *           type: string
 *         description: Filter by subject (e.g. maths)
 *       - in: query
 *         name: teacher
 *         schema:
 *           type: integer
 *         description: Filter by teacher user ID
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Results per page (max 100)
 *     responses:
 *       200:
 *         description: Paginated list of pending content
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied (not a principal)
 */
router.get(
  "/pending",
  authMiddleware,
  roleMiddleware("principal"),
  getPendingContent
);

/**
 * @swagger
 * /content/{id}/approve:
 *   post:
 *     summary: Approve pending content (principal only)
 *     tags: [Content]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Content ID
 *     responses:
 *       200:
 *         description: Content approved
 *       404:
 *         description: Pending content not found
 *       403:
 *         description: Access denied (not a principal)
 */
router.post(
  "/:id/approve",
  authMiddleware,
  roleMiddleware("principal"),
  approveContent
);

/**
 * @swagger
 * /content/{id}/reject:
 *   post:
 *     summary: Reject pending content with reason (principal only)
 *     tags: [Content]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Content ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reason]
 *             properties:
 *               reason:
 *                 type: string
 *                 example: Incomplete content
 *     responses:
 *       200:
 *         description: Content rejected
 *       400:
 *         description: Rejection reason required
 *       404:
 *         description: Pending content not found
 *       403:
 *         description: Access denied (not a principal)
 */
router.post(
  "/:id/reject",
  authMiddleware,
  roleMiddleware("principal"),
  rejectContent
);

/**
 * @swagger
 * /content/live/{teacherId}:
 *   get:
 *     summary: Get currently active live content for a teacher (public)
 *     tags: [Content]
 *     parameters:
 *       - in: path
 *         name: teacherId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Teacher's user ID
 *       - in: query
 *         name: subject
 *         required: false
 *         schema:
 *           type: string
 *         description: Optional subject filter (e.g. maths)
 *     responses:
 *       200:
 *         description: Active content per subject, or empty object if none available
 */
router.get("/live/:teacherId", getLiveContent);

export default router;
