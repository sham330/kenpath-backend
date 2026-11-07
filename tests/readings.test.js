const request = require('supertest');
const jwt = require('jsonwebtoken');

const mockPrisma = {
  user: { findUnique: jest.fn(), create: jest.fn() },
  glucoseReading: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    count: jest.fn(),
    createMany: jest.fn(),
  },
  $transaction: jest.fn(),
  $disconnect: jest.fn(),
};

const mockRedis = {
  get: jest.fn().mockResolvedValue(null),
  setex: jest.fn().mockResolvedValue('OK'),
  keys: jest.fn().mockResolvedValue([]),
  del: jest.fn().mockResolvedValue(1),
  on: jest.fn(),
};

jest.mock('../src/lib/prisma', () => mockPrisma);
jest.mock('ioredis', () => jest.fn(() => mockRedis));

process.env.JWT_SECRET = 'test_secret';

const app = require('../src/index');

const USER_ID = 'user-uuid-123';
const READING_ID = 'reading-uuid-456';
const token = jwt.sign({ sub: USER_ID, email: 'test@example.com' }, 'test_secret');
const auth = () => ({ Authorization: `Bearer ${token}` });

const baseReading = {
  id: READING_ID,
  userId: USER_ID,
  readingDate: new Date('2024-01-15'),
  timeSlot: 'AFTER_LUNCH',
  value: 145,
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  jest.clearAllMocks();
  mockRedis.get.mockResolvedValue(null);
  mockRedis.keys.mockResolvedValue([]);
});

// ─── AUTH GUARD ───────────────────────────────────────────────────────────────

describe('Auth guard', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/readings');
    expect(res.status).toBe(401);
  });

  it('returns 401 with invalid token', async () => {
    const res = await request(app).get('/api/readings').set('Authorization', 'Bearer bad.token');
    expect(res.status).toBe(401);
  });
});

// ─── GET ALL ──────────────────────────────────────────────────────────────────

describe('GET /api/readings', () => {
  it('returns paginated readings from DB when cache is empty', async () => {
    mockPrisma.$transaction.mockResolvedValue([[baseReading], 1]);

    const res = await request(app).get('/api/readings').set(auth());

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta).toMatchObject({ page: 1, pageSize: 10, total: 1, totalPages: 1, hasNext: false, hasPrev: false });
  });

  it('returns cached result when cache is hit', async () => {
    const cached = { data: [baseReading], meta: { page: 1, pageSize: 10, total: 1, totalPages: 1, hasNext: false, hasPrev: false } };
    mockRedis.get.mockResolvedValue(JSON.stringify(cached));

    const res = await request(app).get('/api/readings').set(auth());

    expect(res.status).toBe(200);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('uses page query param', async () => {
    mockPrisma.$transaction.mockResolvedValue([[], 0]);

    const res = await request(app).get('/api/readings?page=2').set(auth());

    expect(res.status).toBe(200);
    expect(res.body.meta.page).toBe(2);
  });

  it('defaults to page 1 for invalid page param', async () => {
    mockPrisma.$transaction.mockResolvedValue([[], 0]);

    const res = await request(app).get('/api/readings?page=abc').set(auth());

    expect(res.status).toBe(200);
    expect(res.body.meta.page).toBe(1);
  });
});

// ─── GET ONE ──────────────────────────────────────────────────────────────────

describe('GET /api/readings/:id', () => {
  it('returns a reading by id', async () => {
    mockPrisma.glucoseReading.findUnique.mockResolvedValue(baseReading);

    const res = await request(app).get(`/api/readings/${READING_ID}`).set(auth());

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(READING_ID);
  });

  it('returns 404 when reading does not exist', async () => {
    mockPrisma.glucoseReading.findUnique.mockResolvedValue(null);

    const res = await request(app).get('/api/readings/nonexistent').set(auth());

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Reading not found');
  });

  it('returns 404 when reading belongs to another user', async () => {
    mockPrisma.glucoseReading.findUnique.mockResolvedValue({ ...baseReading, userId: 'other-user' });

    const res = await request(app).get(`/api/readings/${READING_ID}`).set(auth());

    expect(res.status).toBe(404);
  });
});

// ─── CREATE ───────────────────────────────────────────────────────────────────

describe('POST /api/readings', () => {
  it('creates a reading and returns 201', async () => {
    mockPrisma.glucoseReading.findMany.mockResolvedValue([]);
    mockPrisma.glucoseReading.create.mockResolvedValue(baseReading);

    const res = await request(app).post('/api/readings').set(auth()).send({
      readingDate: '2024-01-15',
      timeSlot: 'AFTER_LUNCH',
      value: 145,
    });

    expect(res.status).toBe(201);
    expect(res.body.value).toBe(145);
    expect(mockRedis.keys).toHaveBeenCalled();
  });

  it('returns 400 when value is missing', async () => {
    const res = await request(app).post('/api/readings').set(auth()).send({
      readingDate: '2024-01-15',
      timeSlot: 'MORNING',
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Please enter a glucose value.');
  });

  it('returns 400 when value is below 40', async () => {
    const res = await request(app).post('/api/readings').set(auth()).send({
      readingDate: '2024-01-15',
      timeSlot: 'MORNING',
      value: 30,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Value must be between 40 and 600 mg/dl.');
  });

  it('returns 400 when value is above 600', async () => {
    const res = await request(app).post('/api/readings').set(auth()).send({
      readingDate: '2024-01-15',
      timeSlot: 'MORNING',
      value: 700,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Value must be between 40 and 600 mg/dl.');
  });

  it('returns 400 when value is a decimal', async () => {
    const res = await request(app).post('/api/readings').set(auth()).send({
      readingDate: '2024-01-15',
      timeSlot: 'MORNING',
      value: 100.5,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Value must be between 40 and 600 mg/dl.');
  });

  it('returns 400 for a future date', async () => {
    const future = new Date();
    future.setDate(future.getDate() + 1);

    const res = await request(app).post('/api/readings').set(auth()).send({
      readingDate: future.toISOString().split('T')[0],
      timeSlot: 'MORNING',
      value: 100,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Date cannot be in the future.');
  });

  it('returns 400 when slot is already taken for that date', async () => {
    mockPrisma.glucoseReading.findMany.mockResolvedValue([{ ...baseReading, timeSlot: 'MORNING' }]);

    const res = await request(app).post('/api/readings').set(auth()).send({
      readingDate: '2024-01-15',
      timeSlot: 'MORNING',
      value: 100,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('You already have a Morning (fasting) reading for this date.');
  });

  it('returns 400 when 4 readings already exist for that day', async () => {
    mockPrisma.glucoseReading.findMany.mockResolvedValue([
      { timeSlot: 'MORNING' }, { timeSlot: 'AFTER_BREAKFAST' },
      { timeSlot: 'AFTER_LUNCH' }, { timeSlot: 'AFTER_DINNER' },
    ]);

    const res = await request(app).post('/api/readings').set(auth()).send({
      readingDate: '2024-01-15',
      timeSlot: 'MORNING',
      value: 100,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('You can add only 4 readings per day.');
  });

  it('returns 400 for invalid timeSlot', async () => {
    const res = await request(app).post('/api/readings').set(auth()).send({
      readingDate: '2024-01-15',
      timeSlot: 'INVALID_SLOT',
      value: 100,
    });

    expect(res.status).toBe(400);
  });
});

// ─── UPDATE ───────────────────────────────────────────────────────────────────

describe('PATCH /api/readings/:id', () => {
  it('updates a reading and invalidates cache', async () => {
    mockPrisma.glucoseReading.findUnique.mockResolvedValue(baseReading);
    mockPrisma.glucoseReading.findFirst.mockResolvedValue(null);
    mockPrisma.glucoseReading.update.mockResolvedValue({ ...baseReading, value: 200 });

    const res = await request(app).patch(`/api/readings/${READING_ID}`).set(auth()).send({ value: 200 });

    expect(res.status).toBe(200);
    expect(res.body.value).toBe(200);
    expect(mockRedis.keys).toHaveBeenCalled();
  });

  it('returns 400 for a future date on update', async () => {
    mockPrisma.glucoseReading.findUnique.mockResolvedValue(baseReading);
    const future = new Date();
    future.setDate(future.getDate() + 1);

    const res = await request(app).patch(`/api/readings/${READING_ID}`).set(auth()).send({
      readingDate: future.toISOString().split('T')[0],
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Date cannot be in the future.');
  });

  it('returns 400 when updated slot conflicts with existing reading', async () => {
    mockPrisma.glucoseReading.findUnique.mockResolvedValue(baseReading);
    mockPrisma.glucoseReading.findFirst.mockResolvedValue({ id: 'other-id' });

    const res = await request(app).patch(`/api/readings/${READING_ID}`).set(auth()).send({
      timeSlot: 'MORNING',
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('You already have a');
  });

  it('returns 404 when reading does not exist', async () => {
    mockPrisma.glucoseReading.findUnique.mockResolvedValue(null);

    const res = await request(app).patch(`/api/readings/nonexistent`).set(auth()).send({ value: 100 });

    expect(res.status).toBe(404);
  });

  it('returns 400 when body is empty', async () => {
    const res = await request(app).patch(`/api/readings/${READING_ID}`).set(auth()).send({});

    expect(res.status).toBe(400);
  });
});

// ─── DELETE ───────────────────────────────────────────────────────────────────

describe('DELETE /api/readings/:id', () => {
  it('deletes a reading and returns 204', async () => {
    mockPrisma.glucoseReading.findUnique.mockResolvedValue(baseReading);
    mockPrisma.glucoseReading.delete.mockResolvedValue(baseReading);

    const res = await request(app).delete(`/api/readings/${READING_ID}`).set(auth());

    expect(res.status).toBe(204);
    expect(mockRedis.keys).toHaveBeenCalled();
  });

  it('returns 404 when reading does not exist', async () => {
    mockPrisma.glucoseReading.findUnique.mockResolvedValue(null);

    const res = await request(app).delete('/api/readings/nonexistent').set(auth());

    expect(res.status).toBe(404);
  });
});
