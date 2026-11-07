const request = require('supertest');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const mockPrisma = {
  user: { findUnique: jest.fn(), create: jest.fn() },
  glucoseReading: {
    findMany: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(),
    create: jest.fn(), update: jest.fn(), delete: jest.fn(),
    deleteMany: jest.fn(), count: jest.fn(), createMany: jest.fn(),
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

const validUser = {
  id: 'uuid-123',
  name: 'Test User',
  email: 'test@example.com',
  password: null,
  createdAt: new Date(),
};

beforeAll(async () => {
  validUser.password = await bcrypt.hash('Test1234!', 12);
});

beforeEach(() => jest.clearAllMocks());

// ─── REGISTER ────────────────────────────────────────────────────────────────

describe('POST /api/auth/register', () => {
  it('creates a user and returns 201', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.create.mockResolvedValue({
      id: validUser.id,
      name: validUser.name,
      email: validUser.email,
      createdAt: validUser.createdAt,
    });

    const res = await request(app).post('/api/auth/register').send({
      name: 'Test User',
      email: 'test@example.com',
      password: 'Test1234!',
    });

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email: 'test@example.com', name: 'Test User' });
    expect(res.body.user.password).toBeUndefined();
  });

  it('returns 409 when email is already in use', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(validUser);

    const res = await request(app).post('/api/auth/register').send({
      name: 'Test User',
      email: 'test@example.com',
      password: 'Test1234!',
    });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Email already in use');
  });

  it('returns 400 when name is missing', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'test@example.com',
      password: 'Test1234!',
    });

    expect(res.status).toBe(400);
  });

  it('returns 400 when email is invalid', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Test User',
      email: 'not-an-email',
      password: 'Test1234!',
    });

    expect(res.status).toBe(400);
  });

  it('returns 400 when password is shorter than 8 characters', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Test User',
      email: 'test@example.com',
      password: 'short',
    });

    expect(res.status).toBe(400);
  });
});

// ─── LOGIN ────────────────────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  it('returns token and user on valid credentials', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(validUser);

    const res = await request(app).post('/api/auth/login').send({
      email: 'test@example.com',
      password: 'Test1234!',
    });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user).toMatchObject({ email: 'test@example.com' });
    expect(res.body.user.password).toBeUndefined();

    const decoded = jwt.verify(res.body.token, 'test_secret');
    expect(decoded.sub).toBe(validUser.id);
  });

  it('returns 401 when user does not exist', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const res = await request(app).post('/api/auth/login').send({
      email: 'ghost@example.com',
      password: 'Test1234!',
    });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
  });

  it('returns 401 when password is wrong', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(validUser);

    const res = await request(app).post('/api/auth/login').send({
      email: 'test@example.com',
      password: 'WrongPassword!',
    });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
  });

  it('returns 400 when email is missing', async () => {
    const res = await request(app).post('/api/auth/login').send({
      password: 'Test1234!',
    });

    expect(res.status).toBe(400);
  });

  it('returns 400 when password is missing', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'test@example.com',
    });

    expect(res.status).toBe(400);
  });
});
