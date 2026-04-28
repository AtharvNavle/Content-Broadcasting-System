# Content Broadcasting System — API Documentation

Backend API for a school content broadcasting system. Teachers upload subject-based content, the principal approves or rejects it, and approved content is broadcasted live to students through a public API with subject-wise time-based rotation.

---

## Base URLs

| Environment | URL |
|---|---|
| **Live (Render)** | `https://content-broadcasting-system-6n6x.onrender.com` |
| **Interactive Docs (Swagger UI)** | `https://content-broadcasting-system-6n6x.onrender.com/api-docs` |
| **Local development** | `http://localhost:3000` |

> If the live URL takes ~30 seconds to respond first time, that's Render's free-tier cold start. Subsequent requests are instant.

---

## Authentication

All protected routes require a JWT in the `Authorization` header:

```
Authorization: Bearer <token>
```

To get a token: register a user, then call `/auth/login`. The token expires after **1 hour**.

---

## Roles

| Role | Permissions |
|---|---|
| `teacher` | Upload content, set schedule, view own content |
| `principal` | View all/pending content, approve, reject |
| (public) | Hit `/content/live/:teacherId` without auth |

---

## Endpoints Summary

| # | Method | Endpoint | Auth | Role |
|---|---|---|---|---|
| 1 | GET | `/` | none | — |
| 2 | POST | `/auth/register` | none | — |
| 3 | POST | `/auth/login` | none | — |
| 4 | GET | `/users/me` | JWT | any |
| 5 | POST | `/content/upload` | JWT | teacher |
| 6 | GET | `/content/my` | JWT | teacher |
| 7 | POST | `/content/:id/schedule` | JWT | teacher |
| 8 | GET | `/content/all` | JWT | principal |
| 9 | GET | `/content/pending` | JWT | principal |
| 10 | POST | `/content/:id/approve` | JWT | principal |
| 11 | POST | `/content/:id/reject` | JWT | principal |
| 12 | GET | `/content/live/:teacherId` | none | public |

---

## 1. Health Check

**`GET /`**

No auth.

**Response 200**
```
API is running
```

---

## 2. Register User

**`POST /auth/register`**

No auth.

**Request body**
```json
{
  "name": "Sam",
  "email": "sam@test.com",
  "password": "password123",
  "role": "teacher"
}
```

**Response 201**
```json
{
  "message": "User registered successfully",
  "user": {
    "id": 1,
    "name": "Sam",
    "email": "sam@test.com",
    "role": "teacher",
    "created_at": "2026-04-28T05:30:00.000Z"
  }
}
```

**Errors**
- `400` — missing fields or invalid role
- `409` — email already registered

---

## 3. Login

**`POST /auth/login`**

No auth.

**Request body**
```json
{
  "email": "sam@test.com",
  "password": "password123"
}
```

**Response 200**
```json
{
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6Ik..."
}
```

The token's payload contains `userId` and `role`, expires in 1 hour.

**Errors**
- `400` — missing email or password
- `401` — invalid credentials

---

## 4. Get Current User

**`GET /users/me`**

JWT required.

**Response 200**
```json
{
  "id": 1,
  "role": "teacher"
}
```

**Errors**
- `401` — no token or invalid token

---

## 5. Upload Content (Teacher)

**`POST /content/upload`**

JWT required (`teacher`). Content type: `multipart/form-data`.

**Form fields**

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | string | yes | |
| `subject` | string | yes | e.g. `maths`, `science` |
| `file` | file | yes | JPG / PNG / GIF, max 10 MB |
| `description` | string | no | |
| `start_time` | ISO datetime | no | when content becomes visible |
| `end_time` | ISO datetime | no | when content stops being visible |
| `rotation_duration` | integer | no | minutes per slot in subject rotation |

If `rotation_duration` is provided, a `content_schedule` row is created in the same transaction.

**Response 200**
```json
{
  "message": "Content uploaded successfully",
  "content": {
    "id": 1,
    "title": "Algebra Quiz",
    "subject": "maths",
    "file_path": "https://content-broadcasting-system.s3.ap-south-1.amazonaws.com/uploads/1745800000000.png",
    "file_type": "image/png",
    "file_size": 234567,
    "uploaded_by": 1,
    "status": "pending",
    "start_time": "2026-04-28T00:00:00",
    "end_time": "2026-04-28T23:59:00",
    "created_at": "2026-04-28T05:35:00.000Z"
  },
  "schedule_created": true
}
```

**Errors**
- `400` — missing title/subject/file, invalid file type, or file > 10 MB
- `401` — no token
- `403` — caller is not a teacher

---

## 6. Get My Content (Teacher)

**`GET /content/my`**

JWT required (`teacher`). Returns content uploaded by the current user.

**Query params**

| Param | Type | Notes |
|---|---|---|
| `subject` | string | filter by subject |
| `status` | string | `pending` / `approved` / `rejected` |
| `page` | integer | default `1` |
| `limit` | integer | default `10`, max `100` |

**Response 200**
```json
{
  "data": [
    {
      "id": 1,
      "title": "Algebra Quiz",
      "subject": "maths",
      "status": "approved",
      "rejection_reason": null,
      "start_time": "2026-04-28T00:00:00",
      "end_time": "2026-04-28T23:59:00",
      "created_at": "2026-04-28T05:35:00.000Z"
    }
  ],
  "pagination": {
    "total": 1,
    "page": 1,
    "limit": 10,
    "totalPages": 1
  }
}
```

---

## 7. Save Content Schedule (Teacher)

**`POST /content/:id/schedule`**

JWT required (`teacher`). Sets or updates the rotation schedule for a content item the teacher owns.

**Request body**
```json
{
  "duration": 5,
  "rotation_order": 1
}
```

| Field | Required | Notes |
|---|---|---|
| `duration` | yes | minutes per slot, must be a positive integer |
| `rotation_order` | no | position in rotation; auto-assigned (max+1) if omitted |

**Response 200**
```json
{
  "message": "Content schedule saved",
  "schedule": {
    "id": 1,
    "content_id": 1,
    "slot_id": 1,
    "rotation_order": 1,
    "duration": 5,
    "created_at": "2026-04-28T05:36:00.000Z"
  }
}
```

**Errors**
- `400` — invalid duration
- `403` — content does not belong to this teacher
- `404` — content not found

---

## 8. Get All Content (Principal)

**`GET /content/all`**

JWT required (`principal`). Returns all content with filters and pagination.

**Query params**

| Param | Type | Notes |
|---|---|---|
| `subject` | string | filter by subject |
| `teacher` | integer | filter by teacher user ID |
| `status` | string | `pending` / `approved` / `rejected` |
| `page` | integer | default `1` |
| `limit` | integer | default `10`, max `100` |

**Response 200**
```json
{
  "data": [
    {
      "id": 1,
      "title": "Algebra Quiz",
      "subject": "maths",
      "status": "approved",
      "uploaded_by": 1,
      "approved_by": 2,
      "approved_at": "2026-04-28T05:40:00.000Z",
      "rejection_reason": null,
      "created_at": "2026-04-28T05:35:00.000Z"
    }
  ],
  "pagination": { "total": 1, "page": 1, "limit": 10, "totalPages": 1 }
}
```

---

## 9. Get Pending Content (Principal)

**`GET /content/pending`**

JWT required (`principal`). Returns only items with `status = pending`.

**Query params**

| Param | Type | Notes |
|---|---|---|
| `subject` | string | filter by subject |
| `teacher` | integer | filter by teacher user ID |
| `page` | integer | default `1` |
| `limit` | integer | default `10`, max `100` |

**Response 200** — same shape as `/content/all`.

---

## 10. Approve Content (Principal)

**`POST /content/:id/approve`**

JWT required (`principal`). Only succeeds if the content is currently `pending`.

**Response 200**
```json
{
  "id": 1,
  "title": "Algebra Quiz",
  "status": "approved",
  "approved_by": 2,
  "approved_at": "2026-04-28T05:40:00.000Z",
  "rejection_reason": null
}
```

**Errors**
- `403` — caller is not a principal
- `404` — pending content with this ID not found (already approved/rejected, or doesn't exist)

---

## 11. Reject Content (Principal)

**`POST /content/:id/reject`**

JWT required (`principal`). Only succeeds if the content is currently `pending`. **Reason is mandatory.**

**Request body**
```json
{
  "reason": "Image quality is too low"
}
```

**Response 200**
```json
{
  "id": 1,
  "status": "rejected",
  "rejection_reason": "Image quality is too low",
  "approved_by": 2,
  "approved_at": "2026-04-28T05:42:00.000Z"
}
```

**Errors**
- `400` — `reason` missing
- `403` — caller is not a principal
- `404` — pending content with this ID not found

---

## 12. Get Live Content (Public)

**`GET /content/live/:teacherId`**

No auth. Returns the currently active approved content per subject for the given teacher.

**Path params**

| Param | Type | Notes |
|---|---|---|
| `teacherId` | integer | teacher's user ID |

**Query params**

| Param | Type | Notes |
|---|---|---|
| `subject` | string | optional — restrict to one subject |

**Rate limited** to 30 requests per minute per IP.

**Response 200 — content active**
```json
{
  "maths": {
    "id": 1,
    "title": "Algebra Quiz",
    "subject": "maths",
    "file_path": "https://content-broadcasting-system.s3.ap-south-1.amazonaws.com/uploads/1745800000000.png",
    "rotation_order": 1,
    "duration": 5,
    "start_time": "2026-04-28T00:00:00",
    "end_time": "2026-04-28T23:59:00"
  },
  "science": {
    "id": 5,
    "title": "Photosynthesis Diagram",
    "subject": "science",
    "file_path": "https://content-broadcasting-system.s3.ap-south-1.amazonaws.com/uploads/1745800001234.jpg",
    "rotation_order": 1,
    "duration": 5
  }
}
```

**Response 200 — no active content (edge cases)**
```json
{}
```

Returns `{}` (not an error) when:
- No approved content for the teacher
- All approved content is outside its `start_time` / `end_time` window
- No content has a valid schedule (`rotation_duration`)
- Teacher ID is invalid (non-numeric or negative)

---

## Scheduling Logic (Most Important)

For each subject, the live API rotates content based on time:

1. Fetch approved content for the teacher within the active time window.
2. Group by subject.
3. For each subject:
   - `totalCycle` = sum of all item durations
   - `position` = `currentMinute % totalCycle`
   - Walk items cumulatively — first item where `position < cumulative` is active

**Example (Maths with 3 items × 5 min each):**
- minute 0–4 → item A
- minute 5–9 → item B
- minute 10–14 → item C
- minute 15 → wraps back to A

Each subject rotates **independently** on its own cycle. Looping is infinite because modulo wraps automatically — no cron job needed.

---

## Error Response Format

All errors return JSON with a `message` field:

```json
{ "message": "Description of what went wrong" }
```

| Status | Meaning |
|---|---|
| `400` | Bad request (missing fields, invalid file, etc.) |
| `401` | Missing or invalid JWT |
| `403` | Wrong role for this endpoint |
| `404` | Resource not found |
| `409` | Conflict (e.g. email already registered) |
| `429` | Rate limit exceeded |
| `500` | Internal server error |

---

## Rate Limits

| Scope | Limit |
|---|---|
| Global (all routes) | 100 requests / 15 minutes per IP |
| Public live API (`/content/live/*`) | 30 requests / 1 minute per IP |

Exceeded requests return `429` with:
```json
{ "message": "Too many requests, please try again later" }
```

---

## File Upload Constraints

| Constraint | Value |
|---|---|
| Allowed types | JPG, PNG, GIF |
| Max size | 10 MB |
| Storage backend | AWS S3 (when AWS env vars are set), otherwise local disk fallback |

---

## Quick Start (cURL)

**1. Register a teacher**
```bash
curl -X POST https://content-broadcasting-system-6n6x.onrender.com/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Sam","email":"sam@test.com","password":"password123","role":"teacher"}'
```

**2. Login**
```bash
curl -X POST https://content-broadcasting-system-6n6x.onrender.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"sam@test.com","password":"password123"}'
```

Save the `token` from the response.

**3. Upload content**
```bash
curl -X POST https://content-broadcasting-system-6n6x.onrender.com/content/upload \
  -H "Authorization: Bearer <TOKEN>" \
  -F "title=Algebra Quiz" \
  -F "subject=maths" \
  -F "start_time=2026-04-28T00:00:00" \
  -F "end_time=2026-04-28T23:59:00" \
  -F "rotation_duration=5" \
  -F "file=@/path/to/image.jpg"
```

**4. Hit the public live endpoint**
```bash
curl https://content-broadcasting-system-6n6x.onrender.com/content/live/1
```

---

## Interactive Documentation

For an interactive UI where you can try every endpoint live with auth:

**[https://content-broadcasting-system-6n6x.onrender.com/api-docs](https://content-broadcasting-system-6n6x.onrender.com/api-docs)**

The Swagger UI lets you authorize once with your JWT and then test all endpoints from the browser.
