-- Run this once on a fresh PostgreSQL database to create the required tables.
-- Connect to your database (e.g. content_system) in pgAdmin Query Tool, then run.

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  email VARCHAR(100) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('teacher', 'principal')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS content (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  subject VARCHAR(50) NOT NULL,
  file_path TEXT NOT NULL,
  file_type VARCHAR(20),
  file_size INTEGER,
  uploaded_by INTEGER NOT NULL REFERENCES users(id),
  status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason TEXT,
  approved_by INTEGER REFERENCES users(id),
  approved_at TIMESTAMP,
  start_time TIMESTAMP,
  end_time TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS content_slots (
  id SERIAL PRIMARY KEY,
  subject VARCHAR(50) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS content_schedule (
  id SERIAL PRIMARY KEY,
  content_id INTEGER NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  slot_id INTEGER NOT NULL REFERENCES content_slots(id) ON DELETE CASCADE,
  rotation_order INTEGER NOT NULL,
  duration INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (slot_id, rotation_order),
  UNIQUE (content_id, slot_id)
);

CREATE INDEX IF NOT EXISTS idx_content_status ON content(status);
CREATE INDEX IF NOT EXISTS idx_content_uploaded_by ON content(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_content_subject ON content(subject);
CREATE INDEX IF NOT EXISTS idx_content_time_window ON content(start_time, end_time);
