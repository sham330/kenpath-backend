# Glucose Tracker API

REST API for logging and reporting blood glucose readings. Built with Node.js, Express, PostgreSQL (Prisma), and Redis.

## Tech Stack

- **Runtime** — Node.js + Express
- **Database** — PostgreSQL via Prisma ORM
- **Cache** — Redis (ioredis)
- **Auth** — JWT (jsonwebtoken) + bcrypt
- **Validation** — Joi
- **Security** — Helmet, express-rate-limit, CORS

---

## Project Structure

```
src/
├── controllers/        # Request handling and validation
│   ├── auth.controller.js
│   ├── readings.controller.js
│   └── reports.controller.js
├── services/           # Business logic
│   ├── auth.service.js
│   ├── readings.service.js
│   └── reports.service.js
├── routes/             # Route definitions
│   ├── auth.routes.js
│   └── readings.routes.js
├── middlewares/
│   └── auth.middleware.js  # JWT authentication
├── lib/
│   ├── prisma.js           # Prisma client
│   └── redis.js            # Redis client
└── index.js                # App entry point

tests/
├── __mocks__/
│   ├── prisma.js           # Prisma mock
│   └── ioredis.js          # Redis mock
├── auth.test.js
├── readings.test.js
└── reports.test.js

prisma/
├── schema.prisma
└── seed.js
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- Docker (for PostgreSQL and Redis)

### 1. Install dependencies

```bash
npm install
```

### 2. Set up environment variables

Create a `.env` file in the root:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/appdb"
PORT=8000
JWT_SECRET=change_this_to_a_long_random_secret_at_least_32_chars
JWT_EXPIRES_IN=7d
REDIS_URL=redis://localhost:6379
ALLOWED_ORIGIN=http://localhost:3000
```

### 3. Start PostgreSQL and Redis

```bash
docker-compose up -d
```

### 4. Run database migrations

```bash
npm run db:migrate
```

### 5. (Optional) Seed the database

```bash
npm run db:seed
```

### 6. Start the server

```bash
npm run dev
```

Server runs on `http://localhost:8000`.

---

## API Reference

All routes except auth require `Authorization: Bearer <token>` header.

### Auth

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register a new user |
| POST | `/api/auth/login` | Login and receive JWT |

#### POST `/api/auth/register`

```json
// Request
{ "name": "John", "email": "john@example.com", "password": "Password123!" }

// Response 201
{ "id": "uuid", "name": "John", "email": "john@example.com", "createdAt": "..." }
```

#### POST `/api/auth/login`

```json
// Request
{ "email": "john@example.com", "password": "Password123!" }

// Response 200
{ "token": "<jwt>", "user": { "id": "uuid", "name": "John", "email": "john@example.com" } }
```

---

### Readings

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/readings?page=1` | Get paginated readings |
| GET | `/api/readings/:id` | Get a single reading |
| POST | `/api/readings` | Create a reading |
| PATCH | `/api/readings/:id` | Update a reading |
| DELETE | `/api/readings/:id` | Delete a reading |

Valid `timeSlot` values: `MORNING`, `AFTER_BREAKFAST`, `AFTER_LUNCH`, `AFTER_DINNER`  
Valid `value` range: integer between `40` and `600`  
Max 4 readings per day (one per slot).

#### POST `/api/readings`

```json
// Request
{ "readingDate": "2026-10-15", "timeSlot": "MORNING", "value": 95 }

// Response 201
{ "id": "uuid", "userId": "uuid", "readingDate": "2026-10-15T00:00:00.000Z", "timeSlot": "MORNING", "value": 95, "createdAt": "..." }
```

#### GET `/api/readings?page=1`

```json
// Response 200
{
  "data": [ { "id": "uuid", "readingDate": "...", "timeSlot": "MORNING", "value": 95 } ],
  "meta": { "total": 25, "page": 1, "pageSize": 10, "totalPages": 3, "hasNext": true, "hasPrev": false }
}
```

---

### Reports

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/readings/reports?type=daily&date=YYYY-MM-DD` | Daily report |
| GET | `/api/readings/reports?type=mtd&date=YYYY-MM-DD` | Month-to-date report |
| GET | `/api/readings/reports?type=monthly&date=YYYY-MM-01` | Full month report |

| Type | Date param | Range |
|------|-----------|-------|
| `daily` | Selected date | That day only |
| `mtd` | Selected date | 1st of month → selected date |
| `monthly` | Any day in the month (use 1st) | Full selected month |

#### Response — with data

```json
{
  "type": "daily",
  "label": "2026-10-15",
  "empty": false,
  "highest": 168,
  "lowest": 95,
  "average": 131.5,
  "count": 2,
  "chartData": [
    { "date": "2026-10-15", "MORNING": 95, "AFTER_LUNCH": 168 }
  ],
  "readings": [
    { "id": "uuid", "timeSlot": "MORNING", "slotLabel": "Morning (fasting)", "value": 95 }
  ]
}
```

> `readings` array is only included in `daily` reports. `chartData` is ready for use with Recharts.

#### Response — empty state

```json
{
  "type": "monthly",
  "label": "2026-09-01 to 2026-09-30",
  "empty": true,
  "message": "No readings found for this period. Start logging to see your report."
}
```

---

## Rate Limiting

| Route | Window | Max requests |
|-------|--------|-------------|
| All routes | 15 min | 100 |
| `/api/auth/*` | 15 min | 20 |

---

## Caching

Readings list responses are cached in Redis per user per page with a 60-second TTL. Cache is automatically invalidated on create, update, or delete.

---

## Running Tests

```bash
npm test
```

Tests use Jest + Supertest with mocked Prisma and Redis — no real database connection needed.

---

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start the server |
| `npm test` | Run all tests |
| `npm run db:migrate` | Run Prisma migrations |
| `npm run db:generate` | Regenerate Prisma client |
| `npm run db:seed` | Seed the database |
