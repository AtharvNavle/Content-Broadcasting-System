# Content Broadcasting System — Backend

Backend implementation of a school content broadcasting system where teachers upload subject-based content, the principal approves or rejects it, and approved content is broadcasted live to students through a public API with subject-wise time-based rotation.

---

## Tech Stack

- **Runtime:** Node.js (v18+ recommended)
- **Framework:** Express
- **Database:** PostgreSQL
- **Authentication:** JWT (`jsonwebtoken`) + `bcrypt` for password hashing
- **File Upload:** `multer` (local disk) or `multer-s3` + AWS S3 (cloud)
- **API Docs:** Swagger UI (`swagger-ui-express` + `swagger-jsdoc`)
- **Security:** `express-rate-limit`
- **Environment:** `dotenv`

---

## Project Structure

```
src/
  controllers/     request handling
  routes/          endpoint registration with Swagger annotations
  services/        reusable business logic
  middlewares/     auth, role, upload
  models/          (reserved)
  utils/           db connection, swagger config
  server.js        app entry
```

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Set up the database

Create a PostgreSQL database (default name: `content_system`), then run the SQL in `schema.sql` against it (using pgAdmin Query Tool or `psql`):

```bash
psql -U postgres -d content_system -f schema.sql
```

### 3. Configure environment

Copy `.env.example` to `.env` and fill in values:

```env
PORT=3000
JWT_SECRET=any_long_random_string

DB_USER=postgres
DB_HOST=localhost
DB_NAME=content_system
DB_PASSWORD=your_pg_password
DB_PORT=5432

# Optional — if set, uploads go to S3 instead of local disk
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=ap-south-1
AWS_BUCKET_NAME=
```

If AWS variables are left blank, the system automatically falls back to local disk storage in `uploads/`.

### 4. Start the server

```bash
npm run dev    # auto-reload via nodemon
# or
npm start
```

### 5. Open Swagger UI

```
http://localhost:3000/api-docs
```

All endpoints are interactive. Use the **Authorize** button to paste a JWT after login.

---

## API Endpoints

### Auth

| Method | Endpoint | Auth | Notes |
|---|---|---|---|
| POST | `/auth/register` | none | body: `name`, `email`, `password`, `role` (teacher / principal) |
| POST | `/auth/login` | none | body: `email`, `password` → returns JWT |

### User

| Method | Endpoint | Auth | Notes |
|---|---|---|---|
| GET | `/users/me` | JWT | returns current user `id` and `role` |

### Content — Teacher

| Method | Endpoint | Auth | Notes |
|---|---|---|---|
| POST | `/content/upload` | teacher | multipart: `title`, `subject`, `file` required; `description`, `start_time`, `end_time`, `rotation_duration` optional |
| GET | `/content/my` | teacher | filters: `subject`, `status`; pagination: `page`, `limit` |
| POST | `/content/:id/schedule` | teacher | body: `duration` required, `rotation_order` optional |

### Content — Principal

| Method | Endpoint | Auth | Notes |
|---|---|---|---|
| GET | `/content/all` | principal | filters: `subject`, `teacher`, `status`; pagination: `page`, `limit` |
| GET | `/content/pending` | principal | filters: `subject`, `teacher`; pagination: `page`, `limit` |
| POST | `/content/:id/approve` | principal | approves a pending item |
| POST | `/content/:id/reject` | principal | body: `reason` required |

### Public

| Method | Endpoint | Auth | Notes |
|---|---|---|---|
| GET | `/content/live/:teacherId` | none | optional query: `subject`; rate limited to 30 req/min |
| GET | `/` | none | health check |

---

## Authentication Flow

1. `POST /auth/register` to create a teacher or principal user.
2. `POST /auth/login` returns a JWT token.
3. Send the token on every protected request:
   ```
   Authorization: Bearer <token>
   ```
4. The server's auth middleware verifies the token and attaches `userId` + `role` to the request.
5. Role middleware enforces teacher/principal access on each route.

---

## Scheduling Logic (Most Important)

For `GET /content/live/:teacherId`:

1. Fetch all approved content for the teacher whose current time is between `start_time` and `end_time`.
2. Group results by subject — each subject rotates independently.
3. For each subject:
   - Sum the durations of all items → `totalCycle`
   - Compute `position = currentMinute % totalCycle`
   - Walk items cumulatively until `position < cumulative` → that's the active item
4. Return the active item per subject. Loop is infinite because modulo wraps automatically.

Example (Maths with 3 items × 5 min each → 15-min cycle):
- minute 0–4 → item A
- minute 5–9 → item B
- minute 10–14 → item C
- minute 15 → wraps to A

---

## Edge Cases Handled

- No approved content for teacher → `{}`
- Approved but outside time window → `{}`
- Approved but no schedule row → `{}`
- Invalid teacher ID (non-numeric) → `{}` (not error)
- Wrong file type uploaded → `400`
- File too large (> 10MB) → `400`
- Approving non-pending content → `404`
- Rejecting without reason → `400`
- Duplicate email on register → `409`
- Missing token / wrong role → `401` / `403`

---

## Bonus Features Implemented

- **AWS S3 storage** — uploads stream to a configured S3 bucket; falls back to local disk if AWS env vars are not set.
- **Rate limiting** — global (100 req / 15 min) and stricter live API limit (30 req / 1 min).
- **Pagination** — `page` and `limit` query params on all list endpoints.
- **Filters** — `subject`, `teacher`, `status` on principal endpoints; `subject`, `status` on teacher endpoint.
- **Swagger UI** — full interactive docs at `/api-docs`.

---

## Architecture Notes

See `architecture-notes.txt` for detailed notes on auth/RBAC, scheduling, database design, folder structure, middleware usage, and scalability approach.

---

## Assumptions / Skipped Features

- Live endpoint is intentionally public (per assignment spec).
- Redis caching for live API not implemented.
- Subject-wise analytics (most active subject, content usage tracking) not implemented.
- S3 is optional — works locally without it via auto-fallback.
