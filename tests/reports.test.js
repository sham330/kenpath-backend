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
    count: jest.fn(),
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
const token = jwt.sign({ sub: USER_ID, email: 'test@example.com' }, 'test_secret');
const auth = () => ({ Authorization: `Bearer ${token}` });

const makeReading = (date, timeSlot, value) => ({
  id: `id-${timeSlot}`,
  userId: USER_ID,
  readingDate: new Date(date),
  timeSlot,
  value,
  createdAt: new Date(),
  updatedAt: new Date(),
});

beforeEach(() => jest.clearAllMocks());

// ─── AUTH GUARD ───────────────────────────────────────────────────────────────

describe('Auth guard on reports', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/readings/reports?type=daily&date=2026-10-15');
    expect(res.status).toBe(401);
  });
});

// ─── VALIDATION ───────────────────────────────────────────────────────────────

describe('GET /api/readings/reports - validation', () => {
  it('returns 400 when type is missing', async () => {
    const res = await request(app).get('/api/readings/reports?date=2026-10-15').set(auth());
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/type/);
  });

  it('returns 400 when date is missing', async () => {
    const res = await request(app).get('/api/readings/reports?type=daily').set(auth());
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/date/);
  });

  it('returns 400 for invalid date format', async () => {
    const res = await request(app).get('/api/readings/reports?type=daily&date=15-10-2026').set(auth());
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/YYYY-MM-DD/);
  });

  it('returns 400 for invalid type', async () => {
    const res = await request(app).get('/api/readings/reports?type=weekly&date=2026-10-15').set(auth());
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid report type/);
  });
});

// ─── DAILY ────────────────────────────────────────────────────────────────────

describe('GET /api/readings/reports?type=daily', () => {
  it('returns stats and readings list for the selected date', async () => {
    mockPrisma.glucoseReading.findMany.mockResolvedValue([
      makeReading('2026-10-15', 'MORNING', 95),
      makeReading('2026-10-15', 'AFTER_LUNCH', 168),
    ]);

    const res = await request(app).get('/api/readings/reports?type=daily&date=2026-10-15').set(auth());

    expect(res.status).toBe(200);
    expect(res.body.type).toBe('daily');
    expect(res.body.empty).toBe(false);
    expect(res.body.highest).toBe(168);
    expect(res.body.lowest).toBe(95);
    expect(res.body.average).toBe(131.5);
    expect(res.body.count).toBe(2);
    expect(res.body.readings).toHaveLength(2);
    expect(res.body.readings[0]).toMatchObject({ timeSlot: 'MORNING', slotLabel: 'Morning (fasting)', value: 95 });
    expect(res.body.chartData).toHaveLength(1);
    expect(res.body.chartData[0]).toMatchObject({ date: '2026-10-15', MORNING: 95, AFTER_LUNCH: 168 });
  });

  it('returns empty state when no readings exist for the date', async () => {
    mockPrisma.glucoseReading.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/readings/reports?type=daily&date=2026-10-15').set(auth());

    expect(res.status).toBe(200);
    expect(res.body.empty).toBe(true);
    expect(res.body.message).toBeDefined();
    expect(res.body.readings).toBeUndefined();
  });

  it('returns correct stats for a single reading', async () => {
    mockPrisma.glucoseReading.findMany.mockResolvedValue([
      makeReading('2026-10-15', 'MORNING', 110),
    ]);

    const res = await request(app).get('/api/readings/reports?type=daily&date=2026-10-15').set(auth());

    expect(res.body.highest).toBe(110);
    expect(res.body.lowest).toBe(110);
    expect(res.body.average).toBe(110);
    expect(res.body.count).toBe(1);
  });
});

// ─── MONTH-TO-DATE ────────────────────────────────────────────────────────────

describe('GET /api/readings/reports?type=mtd', () => {
  it('returns stats for 1st of month to selected date', async () => {
    mockPrisma.glucoseReading.findMany.mockResolvedValue([
      makeReading('2026-10-01', 'MORNING', 100),
      makeReading('2026-10-08', 'AFTER_BREAKFAST', 140),
      makeReading('2026-10-15', 'AFTER_DINNER', 180),
    ]);

    const res = await request(app).get('/api/readings/reports?type=mtd&date=2026-10-15').set(auth());

    expect(res.status).toBe(200);
    expect(res.body.type).toBe('mtd');
    expect(res.body.empty).toBe(false);
    expect(res.body.highest).toBe(180);
    expect(res.body.lowest).toBe(100);
    expect(res.body.average).toBe(140);
    expect(res.body.count).toBe(3);
    expect(res.body.label).toContain('2026-10-01');
    expect(res.body.label).toContain('2026-10-15');
    expect(res.body.readings).toBeUndefined();
    expect(res.body.chartData).toHaveLength(3);
  });

  it('returns empty state when no readings in mtd range', async () => {
    mockPrisma.glucoseReading.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/readings/reports?type=mtd&date=2026-10-15').set(auth());

    expect(res.status).toBe(200);
    expect(res.body.empty).toBe(true);
    expect(res.body.message).toBeDefined();
  });

  it('returns correct average rounded to 1 decimal', async () => {
    mockPrisma.glucoseReading.findMany.mockResolvedValue([
      makeReading('2026-10-01', 'MORNING', 100),
      makeReading('2026-10-02', 'MORNING', 101),
      makeReading('2026-10-03', 'MORNING', 102),
    ]);

    const res = await request(app).get('/api/readings/reports?type=mtd&date=2026-10-15').set(auth());

    expect(res.body.average).toBe(101);
  });
});

// ─── MONTHLY (PREVIOUS MONTH) ─────────────────────────────────────────────────

describe('GET /api/readings/reports?type=monthly', () => {
  it('returns stats for the whole selected month', async () => {
    mockPrisma.glucoseReading.findMany.mockResolvedValue([
      makeReading('2026-09-01', 'MORNING', 88),
      makeReading('2026-09-15', 'AFTER_LUNCH', 155),
      makeReading('2026-09-30', 'AFTER_DINNER', 210),
    ]);

    const res = await request(app).get('/api/readings/reports?type=monthly&date=2026-09-15').set(auth());

    expect(res.status).toBe(200);
    expect(res.body.type).toBe('monthly');
    expect(res.body.empty).toBe(false);
    expect(res.body.highest).toBe(210);
    expect(res.body.lowest).toBe(88);
    expect(res.body.average).toBe(151);
    expect(res.body.count).toBe(3);
    expect(res.body.label).toContain('2026-09-01');
    expect(res.body.label).toContain('2026-09-30');
    expect(res.body.readings).toBeUndefined();
  });

  it('returns empty state when no readings in selected month', async () => {
    mockPrisma.glucoseReading.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/readings/reports?type=monthly&date=2026-09-15').set(auth());

    expect(res.status).toBe(200);
    expect(res.body.empty).toBe(true);
    expect(res.body.message).toBeDefined();
  });

  it('correctly resolves December when selected date is in December', async () => {
    mockPrisma.glucoseReading.findMany.mockResolvedValue([
      makeReading('2026-12-15', 'MORNING', 120),
    ]);

    const res = await request(app).get('/api/readings/reports?type=monthly&date=2026-12-10').set(auth());

    expect(res.status).toBe(200);
    expect(res.body.label).toContain('2026-12-01');
    expect(res.body.label).toContain('2026-12-31');
  });
});

// ─── CHART DATA ───────────────────────────────────────────────────────────────

describe('chartData shape', () => {
  it('groups multiple slots under the same date object', async () => {
    mockPrisma.glucoseReading.findMany.mockResolvedValue([
      makeReading('2026-10-15', 'MORNING', 95),
      makeReading('2026-10-15', 'AFTER_BREAKFAST', 130),
      makeReading('2026-10-15', 'AFTER_LUNCH', 168),
      makeReading('2026-10-15', 'AFTER_DINNER', 145),
    ]);

    const res = await request(app).get('/api/readings/reports?type=daily&date=2026-10-15').set(auth());

    expect(res.body.chartData).toHaveLength(1);
    expect(res.body.chartData[0]).toMatchObject({
      date: '2026-10-15',
      MORNING: 95,
      AFTER_BREAKFAST: 130,
      AFTER_LUNCH: 168,
      AFTER_DINNER: 145,
    });
  });

  it('produces one chartData entry per day for multi-day reports', async () => {
    mockPrisma.glucoseReading.findMany.mockResolvedValue([
      makeReading('2026-10-01', 'MORNING', 100),
      makeReading('2026-10-02', 'MORNING', 110),
      makeReading('2026-10-03', 'MORNING', 120),
    ]);

    const res = await request(app).get('/api/readings/reports?type=mtd&date=2026-10-15').set(auth());

    expect(res.body.chartData).toHaveLength(3);
  });
});
