import { pool } from "../utils/db.js";
import { isS3 } from "../middlewares/uploadMiddleware.js";

const toPositiveIntOrNull = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
};

// ================== UPLOAD ==================
export const uploadContent = async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      title,
      description,
      subject,
      start_time,
      end_time,
      rotation_duration,
    } = req.body;
    const rotationDuration = toPositiveIntOrNull(rotation_duration);

    if (!title || !subject) {
      return res.status(400).json({ message: "Title and subject required" });
    }

    if (!req.file) {
      return res.status(400).json({ message: "File is required" });
    }

    await client.query("BEGIN");

    const result = await client.query(
      `INSERT INTO content 
      (title, description, subject, file_path, file_type, file_size, uploaded_by, status, start_time, end_time)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING *`,
      [
        title,
        description,
        subject,
        isS3 ? req.file.location : req.file.path,
        req.file.mimetype || req.file.contentType,
        req.file.size,
        req.user.userId,
        "pending",
        start_time,
        end_time,
      ]
    );

    if (rotationDuration) {
      const slotResult = await client.query(
        `INSERT INTO content_slots (subject)
         VALUES ($1)
         ON CONFLICT (subject) DO UPDATE SET subject = EXCLUDED.subject
         RETURNING id`,
        [subject]
      );

      const slotId = slotResult.rows[0].id;
      const nextOrderResult = await client.query(
        `SELECT COALESCE(MAX(rotation_order), 0) + 1 AS next_order
         FROM content_schedule
         WHERE slot_id = $1`,
        [slotId]
      );

      await client.query(
        `INSERT INTO content_schedule (content_id, slot_id, rotation_order, duration)
         VALUES ($1, $2, $3, $4)`,
        [
          result.rows[0].id,
          slotId,
          nextOrderResult.rows[0].next_order,
          rotationDuration,
        ]
      );
    }

    await client.query("COMMIT");

    return res.json({
      message: "Content uploaded successfully",
      content: result.rows[0],
      schedule_created: Boolean(rotationDuration),
    });
  } catch (err) {
    await client.query("ROLLBACK");
    return res.status(500).json({ message: err.message });
  } finally {
    client.release();
  }
};

// ================== GET TEACHER CONTENT ==================
export const getMyContent = async (req, res) => {
  try {
    const { subject, status, page = 1, limit = 10 } = req.query;

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 10));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [`uploaded_by = $1`];
    const values = [req.user.userId];

    if (subject) {
      values.push(subject);
      conditions.push(`subject = $${values.length}`);
    }
    if (status) {
      values.push(status);
      conditions.push(`status = $${values.length}`);
    }

    const where = `WHERE ${conditions.join(" AND ")}`;

    values.push(limitNum);
    const limitPlaceholder = `$${values.length}`;
    values.push(offset);
    const offsetPlaceholder = `$${values.length}`;

    const [dataResult, countResult] = await Promise.all([
      pool.query(
        `SELECT id, title, subject, status, rejection_reason, start_time, end_time, created_at
         FROM content
         ${where}
         ORDER BY created_at DESC
         LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
        values
      ),
      pool.query(
        `SELECT COUNT(*) FROM content ${where}`,
        values.slice(0, values.length - 2)
      ),
    ]);

    return res.json({
      data: dataResult.rows,
      pagination: {
        total: Number(countResult.rows[0].count),
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(Number(countResult.rows[0].count) / limitNum),
      },
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ================== GET ALL CONTENT (PRINCIPAL) ==================
export const getAllContent = async (req, res) => {
  try {
    const { subject, teacher, status, page = 1, limit = 10 } = req.query;

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 10));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];
    const values = [];

    if (subject) {
      values.push(subject);
      conditions.push(`subject = $${values.length}`);
    }
    if (teacher) {
      values.push(Number(teacher));
      conditions.push(`uploaded_by = $${values.length}`);
    }
    if (status) {
      values.push(status);
      conditions.push(`status = $${values.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    values.push(limitNum);
    const limitPlaceholder = `$${values.length}`;
    values.push(offset);
    const offsetPlaceholder = `$${values.length}`;

    const [dataResult, countResult] = await Promise.all([
      pool.query(
        `SELECT id, title, subject, status, uploaded_by, approved_by, approved_at, rejection_reason, created_at
         FROM content
         ${where}
         ORDER BY created_at DESC
         LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
        values
      ),
      pool.query(
        `SELECT COUNT(*) FROM content ${where}`,
        values.slice(0, values.length - 2)
      ),
    ]);

    return res.json({
      data: dataResult.rows,
      pagination: {
        total: Number(countResult.rows[0].count),
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(Number(countResult.rows[0].count) / limitNum),
      },
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ================== UPSERT SCHEDULE ==================
export const upsertContentSchedule = async (req, res) => {
  try {
    const { id } = req.params;
    const { duration, rotation_order } = req.body;

    const scheduleDuration = toPositiveIntOrNull(duration);
    if (!scheduleDuration) {
      return res
        .status(400)
        .json({ message: "Valid duration (minutes) is required" });
    }

    const contentResult = await pool.query(
      "SELECT id, subject, uploaded_by FROM content WHERE id = $1",
      [id]
    );
    if (contentResult.rows.length === 0) {
      return res.status(404).json({ message: "Content not found" });
    }

    const content = contentResult.rows[0];
    if (content.uploaded_by !== req.user.userId) {
      return res.status(403).json({ message: "Access denied" });
    }

    const slotResult = await pool.query(
      `INSERT INTO content_slots (subject)
       VALUES ($1)
       ON CONFLICT (subject) DO UPDATE SET subject = EXCLUDED.subject
       RETURNING id`,
      [content.subject]
    );
    const slotId = slotResult.rows[0].id;

    let order = toPositiveIntOrNull(rotation_order);
    if (!order) {
      const nextOrderResult = await pool.query(
        `SELECT COALESCE(MAX(rotation_order), 0) + 1 AS next_order
         FROM content_schedule
         WHERE slot_id = $1`,
        [slotId]
      );
      order = nextOrderResult.rows[0].next_order;
    }

    const scheduleResult = await pool.query(
      `INSERT INTO content_schedule (content_id, slot_id, rotation_order, duration)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (content_id, slot_id)
       DO UPDATE SET rotation_order = EXCLUDED.rotation_order, duration = EXCLUDED.duration
       RETURNING *`,
      [content.id, slotId, order, scheduleDuration]
    );

    return res.json({
      message: "Content schedule saved",
      schedule: scheduleResult.rows[0],
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ================== GET PENDING ==================
export const getPendingContent = async (req, res) => {
  try {
    const { subject, teacher, page = 1, limit = 10 } = req.query;

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 10));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [`status = 'pending'`];
    const values = [];

    if (subject) {
      values.push(subject);
      conditions.push(`subject = $${values.length}`);
    }
    if (teacher) {
      values.push(Number(teacher));
      conditions.push(`uploaded_by = $${values.length}`);
    }

    const where = `WHERE ${conditions.join(" AND ")}`;

    values.push(limitNum);
    const limitPlaceholder = `$${values.length}`;
    values.push(offset);
    const offsetPlaceholder = `$${values.length}`;

    const [dataResult, countResult] = await Promise.all([
      pool.query(
        `SELECT id, title, subject, status, uploaded_by, rejection_reason, created_at
         FROM content
         ${where}
         ORDER BY created_at DESC
         LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
        values
      ),
      pool.query(
        `SELECT COUNT(*) FROM content ${where}`,
        values.slice(0, values.length - 2)
      ),
    ]);

    return res.json({
      data: dataResult.rows,
      pagination: {
        total: Number(countResult.rows[0].count),
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(Number(countResult.rows[0].count) / limitNum),
      },
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ================== APPROVE ==================
export const approveContent = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE content 
       SET status = 'approved', 
           approved_by = $1, 
           approved_at = NOW(),
           rejection_reason = NULL
       WHERE id = $2 AND status = 'pending'
       RETURNING *`,
      [req.user.userId, id]
    );

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ message: "Pending content not found for approval" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ================== REJECT ==================
export const rejectContent = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({ message: "Rejection reason required" });
    }

    const result = await pool.query(
      `UPDATE content 
       SET status = 'rejected', 
           rejection_reason = $1,
           approved_by = $2,
           approved_at = NOW()
       WHERE id = $3 AND status = 'pending'
       RETURNING *`,
      [reason, req.user.userId, id]
    );

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ message: "Pending content not found for rejection" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ================== LIVE CONTENT ==================
export const getLiveContent = async (req, res) => {
  try {
    const { teacherId } = req.params;
    const subjectFilter = req.query.subject;
    const now = new Date();
    const teacherIdNumber = Number(teacherId);

    // Invalid teacher id returns empty response per assignment spec, not an error.
    if (!Number.isInteger(teacherIdNumber) || teacherIdNumber <= 0) {
      return res.json({});
    }

    const result = await pool.query(
      `SELECT c.*, cs.rotation_order, cs.duration
       FROM content c
       JOIN content_schedule cs ON c.id = cs.content_id
       JOIN content_slots s ON cs.slot_id = s.id
       WHERE c.uploaded_by = $1
       AND c.status = 'approved'
       AND c.start_time <= $2
       AND c.end_time >= $2
       AND ($3::text IS NULL OR c.subject = $3::text)
       ORDER BY c.subject, cs.rotation_order`,
      [teacherIdNumber, now, subjectFilter || null]
    );

    const contents = result.rows;
    if (contents.length === 0) {
      return res.json({});
    }

    const grouped = {};
    for (const content of contents) {
      if (!grouped[content.subject]) {
        grouped[content.subject] = [];
      }
      grouped[content.subject].push(content);
    }

    const response = {};
    const currentMinute = Math.floor(now.getTime() / 1000 / 60);

    for (const subject in grouped) {
      const subjectContents = grouped[subject].filter(
        (item) => Number.isFinite(Number(item.duration)) && Number(item.duration) > 0
      );
      if (subjectContents.length === 0) {
        continue;
      }

      const totalCycle = subjectContents.reduce(
        (sum, c) => sum + Number(c.duration),
        0
      );
      if (totalCycle <= 0) {
        continue;
      }

      // Time-based modulo rotation: walks cumulative durations until we land in the active slot.
      const position = currentMinute % totalCycle;
      let cumulative = 0;
      let activeContent = null;

      for (const content of subjectContents) {
        cumulative += Number(content.duration);
        if (position < cumulative) {
          activeContent = content;
          break;
        }
      }

      if (activeContent) {
        response[subject] = activeContent;
      }
    }

    if (Object.keys(response).length === 0) {
      return res.json({});
    }

    return res.json(response);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};