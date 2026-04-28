# Content Broadcasting System — Full Project Documentation

---

## 1. Understanding the Task

The assignment asked to build a **backend system** for a school environment where:

- Teachers upload subject-based content (question papers, announcements, study material)
- A Principal reviews uploaded content and either approves or rejects it with a reason
- Once approved, the content gets broadcasted live to students through a public API
- Students access the live content via a teacher-specific URL on their devices
- The system must rotate content per subject on a time-based schedule

The key challenge was not just building CRUD APIs — the real complexity was the **scheduling and rotation logic**: the system must dynamically determine which content is currently active for a given teacher and subject, rotate through multiple items over time, and loop continuously without manual intervention.

---

## 2. Planning and Approach

Before writing code, the system was broken down into clear modules:

### Problems identified
1. Multiple users with different roles accessing the same system — needs **auth + role separation**
2. Files need to be stored somewhere — needs **file upload handling**
3. Content has a lifecycle (pending → approved/rejected) — needs **state management**
4. Live API must show the right content at the right time — needs **scheduling logic**
5. Public API could be abused — needs **rate limiting**
6. System needs to handle gracefully when nothing is available — needs **edge case handling**

### Decisions made

| Decision | Choice | Reason |
|---|---|---|
| Language | Node.js + Express | Fast to build REST APIs, assignment specified it |
| Database | PostgreSQL | Relational — content/users/schedule have clear relationships |
| Auth | JWT | Stateless, role can be embedded in token |
| File upload | multer + AWS S3 | multer handles parsing, S3 for durable cloud storage |
| API docs | Swagger UI | Interactive, evaluator can test without Postman setup |
| Module system | ES Modules | Modern JavaScript, consistent across codebase |

### Scheduling approach decision
The key insight was: instead of a background job or cron that updates a "currently active" flag in DB (which would need polling and state management), use **pure math at request time**.

The formula:
```
currentMinute = floor(Date.now() / 1000 / 60)
position = currentMinute % totalCycleDuration
walk items by cumulative duration until position < cumulative
```

This means no background jobs, no DB writes for rotation, and the loop is mathematically infinite.

---

## 3. Technologies and Libraries

### Runtime & Framework
| Package | Version | Purpose |
|---|---|---|
| Node.js | v22 | JavaScript runtime |
| Express | ^4.19.2 | HTTP server and routing |

### Database
| Package | Version | Purpose |
|---|---|---|
| PostgreSQL | — | Relational database |
| pg | ^8.20.0 | PostgreSQL client for Node.js |

### Authentication & Security
| Package | Version | Purpose |
|---|---|---|
| jsonwebtoken | ^9.0.3 | Sign and verify JWT tokens |
| bcrypt | ^6.0.0 | Hash and compare passwords |
| express-rate-limit | ^8.4.1 | Limit request rates per IP |

### File Upload & Storage
| Package | Version | Purpose |
|---|---|---|
| multer | ^2.1.1 | Parse multipart/form-data for file uploads |
| multer-s3 | ^3.0.1 | Stream multer uploads directly to S3 |
| @aws-sdk/client-s3 | ^3.1037.0 | AWS SDK v3 to connect to S3 |

### API Documentation
| Package | Version | Purpose |
|---|---|---|
| swagger-jsdoc | ^6.2.8 | Generate OpenAPI spec from JSDoc comments in routes |
| swagger-ui-express | ^5.0.1 | Serve interactive Swagger UI at /api-docs |

### Developer Tools
| Package | Purpose |
|---|---|
| nodemon | Auto-restart server on file changes |
| dotenv | Load .env environment variables |

---

## 4. Project Folder Structure

```
Content Broadcasting System/
│
├── src/
│   ├── controllers/          Request handling — reads input, calls logic, sends response
│   │   ├── authController.js
│   │   ├── contentController.js
│   │   └── userController.js
│   │
│   ├── routes/               Endpoint definitions — registers URLs and middleware chains
│   │   ├── authRoutes.js
│   │   ├── contentRoutes.js
│   │   ├── userRoutes.js
│   │   └── index.js          (health check route)
│   │
│   ├── services/             Reusable business logic — shared across controllers
│   │   └── authService.js
│   │
│   ├── middlewares/          Request interceptors — run before controllers
│   │   ├── authMiddleware.js
│   │   ├── roleMiddleware.js
│   │   └── uploadMiddleware.js
│   │
│   ├── models/               Reserved for query abstractions (currently placeholder)
│   │
│   ├── utils/                Shared infrastructure
│   │   ├── db.js             PostgreSQL connection pool
│   │   └── swagger.js        Swagger spec config
│   │
│   └── server.js             App entry point — mounts routes, rate limiters, error handler
│
├── uploads/                  Local file storage (fallback when S3 not configured)
├── .env                      Environment variables (not committed to git)
├── .env.example              Template for environment setup
├── .gitignore
├── package.json
├── README.md
├── architecture-notes.txt    Required by assignment
└── postman_collection.json
```

---

## 5. Key Files Explained

### `src/server.js`
The application entry point. Responsibilities:
- Loads environment variables via dotenv
- Creates the Express app
- Applies global rate limiter (100 req/15 min) and live API rate limiter (30 req/min)
- Mounts all route groups at their base paths
- Registers the global error handler for multer and other errors
- Starts the HTTP server

### `src/utils/db.js`
Creates a single PostgreSQL connection pool shared across the entire app. Uses environment variables for all connection config so credentials never appear in code.

### `src/middlewares/authMiddleware.js`
Runs before any protected route. Reads the `Authorization: Bearer <token>` header, verifies the JWT using the secret key, and attaches the decoded `{ userId, role }` to `req.user`. Returns `401` if token is missing or invalid.

### `src/middlewares/roleMiddleware.js`
Runs after authMiddleware. Checks if `req.user.role` matches the role required by the route. Returns `403` if the role doesn't match. Used as `roleMiddleware("teacher")` or `roleMiddleware("principal")`.

### `src/middlewares/uploadMiddleware.js`
Handles file upload parsing via multer. Automatically detects whether AWS credentials are present in `.env`:
- If yes → uses `multer-s3` to stream directly to S3 bucket
- If no → falls back to local disk storage in `uploads/`
Enforces JPG/PNG/GIF only and 10MB max size.

### `src/services/authService.js`
Contains reusable auth business logic:
- `registerUser` — validates email uniqueness, hashes password with bcrypt, inserts user
- `loginUser` — queries user by email, compares password hash, signs and returns JWT

### `src/controllers/authController.js`
Handles HTTP layer for auth:
- `POST /auth/register` — validates input, calls registerUser, returns created user
- `POST /auth/login` — validates input, calls loginUser, returns token

### `src/controllers/contentController.js`
The largest and most important file. Contains all content logic:
- `uploadContent` — validates fields, inserts content row, optionally creates schedule in a transaction
- `getMyContent` — teacher's own content with filters and pagination
- `getAllContent` — principal view of all content with filters and pagination
- `getPendingContent` — principal view of pending content with filters and pagination
- `approveContent` — updates status to approved, only if currently pending
- `rejectContent` — updates status to rejected with reason, only if currently pending
- `upsertContentSchedule` — creates or updates schedule for a content item
- `getLiveContent` — the core scheduling logic (see Section 7)

### `src/utils/swagger.js`
Configures swagger-jsdoc to scan all route files for JSDoc annotations and generate the OpenAPI spec. Defines the bearer auth security scheme so the Authorize button works in Swagger UI.

---

## 6. Database Design

Four tables with foreign key relationships:

```
users ──────────────────────────────────────┐
  id, name, email, password_hash,            │
  role (teacher/principal), created_at       │
                                             │
content ──────────────────────────────────  │
  id, title, description, subject,          FK: uploaded_by → users.id
  file_path, file_type, file_size,          FK: approved_by → users.id
  uploaded_by, status, rejection_reason,    │
  approved_by, approved_at,                 │
  start_time, end_time, created_at          │
        │                                   │
        │ FK: content_id                    │
        ▼                                   │
content_schedule ──────────────────────── ─┘
  id, content_id, slot_id,
  rotation_order, duration, created_at
        │
        │ FK: slot_id
        ▼
content_slots
  id, subject (unique), created_at
```

### Why this structure
- `content_slots` acts as a subject channel — one row per subject (maths, science, etc.)
- `content_schedule` links content to a slot with an ordering position and duration
- This separation means the same slot (subject) can hold multiple content items in a defined rotation order
- Foreign keys ensure data integrity — can't schedule content that doesn't exist, can't reference a slot that doesn't exist

---

## 7. Scheduling Logic (Most Important)

### How it works

When `GET /content/live/:teacherId` is called:

**Step 1** — Query DB for all eligible content:
```sql
SELECT c.*, cs.rotation_order, cs.duration
FROM content c
JOIN content_schedule cs ON c.id = cs.content_id
JOIN content_slots s ON cs.slot_id = s.id
WHERE c.uploaded_by = teacherId
AND c.status = 'approved'
AND c.start_time <= NOW()
AND c.end_time >= NOW()
ORDER BY c.subject, cs.rotation_order
```
Only approved content currently within its active time window is returned.

**Step 2** — Group by subject:
```
{
  maths:   [contentA (5min), contentB (5min), contentC (5min)],
  science: [contentX (5min), contentY (5min)]
}
```

**Step 3** — For each subject independently, determine which item is active right now:
```javascript
totalCycle = 5 + 5 + 5 = 15 minutes
currentTime = Math.floor(Date.now() / 1000 / 60)  // minutes since epoch
position = currentTime % totalCycle                 // 0 to 14
```

Walk through items cumulatively:
```
contentA cumulative: 5  → if position < 5, contentA is active
contentB cumulative: 10 → if position < 10, contentB is active
contentC cumulative: 15 → if position < 15, contentC is active
```

Minute 0–4 → contentA
Minute 5–9 → contentB
Minute 10–14 → contentC
Minute 15 → wraps back to 0 → contentA again (infinite loop)

**Step 4** — Return one active item per subject:
```json
{
  "maths": { "title": "Algebra Quiz", "file_path": "https://s3.amazonaws.com/...", ... },
  "science": { "title": "Physics Chapter 1", "file_path": "https://s3.amazonaws.com/...", ... }
}
```

---

## 8. API Calls — Full Reference

### Authentication

| # | Method | Endpoint | Auth | Body / Notes |
|---|---|---|---|---|
| 1 | POST | `/auth/register` | None | `name, email, password, role` |
| 2 | POST | `/auth/login` | None | `email, password` → returns token |

### User

| # | Method | Endpoint | Auth | Notes |
|---|---|---|---|---|
| 3 | GET | `/users/me` | JWT | Returns current user id and role |

### Content — Teacher

| # | Method | Endpoint | Auth | Body / Notes |
|---|---|---|---|---|
| 4 | POST | `/content/upload` | JWT (teacher) | multipart: `title`, `subject`, `file` required; `description`, `start_time`, `end_time`, `rotation_duration` optional |
| 5 | GET | `/content/my` | JWT (teacher) | filters: `?subject=`, `?status=`; pagination: `?page=`, `?limit=` |
| 6 | POST | `/content/:id/schedule` | JWT (teacher) | `duration` (required, minutes), `rotation_order` (optional) |

### Content — Principal

| # | Method | Endpoint | Auth | Body / Notes |
|---|---|---|---|---|
| 7 | GET | `/content/all` | JWT (principal) | filters: `?subject=`, `?teacher=`, `?status=`; pagination: `?page=`, `?limit=` |
| 8 | GET | `/content/pending` | JWT (principal) | filters: `?subject=`, `?teacher=`; pagination: `?page=`, `?limit=` |
| 9 | POST | `/content/:id/approve` | JWT (principal) | No body required |
| 10 | POST | `/content/:id/reject` | JWT (principal) | `reason` (required) |

### Public

| # | Method | Endpoint | Auth | Notes |
|---|---|---|---|---|
| 11 | GET | `/content/live/:teacherId` | None | optional: `?subject=maths`; rate limited to 30 req/min |
| 12 | GET | `/` | None | Health check — returns "API is running" |

---

## 9. Security Implementation

| Concern | How it's handled |
|---|---|
| Passwords | bcrypt hashed before storing, never stored as plain text |
| Auth tokens | JWT signed with secret, expire in 1 hour |
| Role enforcement | roleMiddleware on every protected route |
| Sensitive data | auth query selects only `id, role, password_hash` — not `SELECT *` |
| File types | multer fileFilter rejects non-image types before processing |
| File size | multer limits enforce 10MB max |
| API abuse | Global rate limit (100/15min) + stricter live API limit (30/1min) |
| Config secrets | All credentials in `.env`, excluded from git via `.gitignore` |

---

## 10. Edge Cases Handled

| Situation | What happens |
|---|---|
| No content for teacher | `{}` returned |
| Content approved but outside time window | `{}` returned (filtered by start/end time in query) |
| Content approved but no schedule row | `{}` returned (JOIN with content_schedule excludes it) |
| Invalid teacher ID (non-numeric) | `{}` returned, not an error |
| Wrong file type uploaded | `400 Invalid file type. Only JPG, PNG, GIF allowed` |
| File over 10MB | `400 File too large. Max size is 10MB` |
| Approving already-approved content | `404 Pending content not found for approval` |
| Rejecting without reason | `400 Rejection reason required` |
| Duplicate email on register | `409 Email already registered` |
| Missing login credentials | `400 Email and password are required` |
| Wrong password | `401 Invalid credentials` |
| No token on protected route | `401 No token provided` |
| Wrong role accessing a route | `403 Access denied` |
| Too many requests (global) | `429 Too many requests, please try again later` |
| Too many requests (live API) | `429 Too many requests to live API, please slow down` |

---

## 11. Bonus Features Implemented

### Rate Limiting
- Global: 100 requests per 15 minutes per IP across all routes
- Live API: stricter at 30 requests per minute — the student-facing endpoint most likely to receive high traffic

### Pagination and Filters
All list endpoints support:
- `?page=` and `?limit=` for pagination (default page 1, limit 10, max 100)
- `?subject=` to filter by subject
- `?teacher=` to filter by teacher user ID (principal endpoints)
- `?status=` to filter by content status

All paginated responses include:
```json
{
  "data": [...],
  "pagination": {
    "total": 45,
    "page": 1,
    "limit": 10,
    "totalPages": 5
  }
}
```

### AWS S3 File Storage
- Files are uploaded directly to S3 bucket via multer-s3
- S3 public URL is stored in the database
- Falls back to local disk automatically if AWS credentials are not configured
- Files stored under `uploads/` prefix in the bucket with timestamp-based filenames

---

## 12. Demo Sequence (For Video)

**Recommended order to demonstrate all features in 5–7 minutes:**

1. Show project folder structure briefly
2. Show Swagger UI at `http://localhost:3000/api-docs`
3. Register a teacher (`POST /auth/register`)
4. Register a principal (`POST /auth/register`)
5. Login as teacher → copy token → Authorize in Swagger
6. Upload 2 content items with subject `maths`, duration `5`
7. Upload 1 content item with subject `science`, duration `5`
8. `GET /content/my` — show pending status, show pagination working
9. Login as principal → copy token → re-Authorize
10. `GET /content/pending` — show the 3 uploads waiting
11. `GET /content/all?status=pending` — show filter working
12. Approve all 3 content items
13. Open browser → `GET /content/live/<teacherId>` — show active content by subject
14. Open pgAdmin → show rows in all 4 tables
15. Upload a 4th item → reject it with a reason
16. Login as teacher → `GET /content/my?status=rejected` — show rejection reason visible
17. Try uploading a PDF → show `400 Invalid file type`
18. Try accessing `/content/pending` with teacher token → show `403 Access denied`
