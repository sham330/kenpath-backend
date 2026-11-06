const prisma = require('../lib/prisma');
const redis = require('../lib/redis');

const CACHE_TTL = 60; // seconds
const cacheKey = (userId, page) => `readings:${userId}:${page}`;

const SLOT_LABELS = {
  MORNING: 'Morning (fasting)',
  AFTER_BREAKFAST: 'After breakfast',
  AFTER_LUNCH: 'After lunch',
  AFTER_DINNER: 'After dinner',
};

const toDateOnly = (dateStr) => {
  const d = new Date(dateStr);
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

const isFutureDate = (dateStr) => {
  const input = toDateOnly(dateStr);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return input > today;
};

const PAGE_SIZE = 10;

const getAll = async (userId, page = 1) => {
  const skip = (page - 1) * PAGE_SIZE;
  const key = cacheKey(userId, page);

  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);

  const [data, total] = await prisma.$transaction([
    prisma.glucoseReading.findMany({
      where: { userId },
      orderBy: [{ readingDate: 'desc' }, { createdAt: 'desc' }],
      skip,
      take: PAGE_SIZE,
    }),
    prisma.glucoseReading.count({ where: { userId } }),
  ]);

  const result = {
    data,
    meta: {
      total,
      page,
      pageSize: PAGE_SIZE,
      totalPages: Math.ceil(total / PAGE_SIZE),
      hasNext: page * PAGE_SIZE < total,
      hasPrev: page > 1,
    },
  };

  await redis.setex(key, CACHE_TTL, JSON.stringify(result));
  return result;
};

const getOne = async (userId, id) => {
  const reading = await prisma.glucoseReading.findUnique({ where: { id } });
  if (!reading || reading.userId !== userId) throw { status: 404, message: 'Reading not found' };
  return reading;
};

const invalidateCache = async (userId) => {
  const keys = await redis.keys(`readings:${userId}:*`);
  if (keys.length) await redis.del(...keys);
};

const create = async (userId, { readingDate, timeSlot, value }) => {
  if (isFutureDate(readingDate))
    throw { status: 400, message: 'Date cannot be in the future.' };

  const date = toDateOnly(readingDate);

  const dayReadings = await prisma.glucoseReading.findMany({
    where: { userId, readingDate: date },
  });

  if (dayReadings.length >= 4)
    throw { status: 400, message: 'You can add only 4 readings per day.' };

  const slotTaken = dayReadings.some((r) => r.timeSlot === timeSlot);
  if (slotTaken)
    throw { status: 400, message: `You already have a ${SLOT_LABELS[timeSlot]} reading for this date.` };

  const created = await prisma.glucoseReading.create({
    data: { userId, readingDate: date, timeSlot, value },
  });
  await invalidateCache(userId);
  return created;
};

const update = async (userId, id, { readingDate, timeSlot, value }) => {
  const existing = await getOne(userId, id);

  if (readingDate && isFutureDate(readingDate))
    throw { status: 400, message: 'Date cannot be in the future.' };

  const date = readingDate ? toDateOnly(readingDate) : existing.readingDate;
  const slot = timeSlot || existing.timeSlot;

  const conflict = await prisma.glucoseReading.findFirst({
    where: { userId, readingDate: date, timeSlot: slot, NOT: { id } },
  });

  if (conflict)
    throw { status: 400, message: `You already have a ${SLOT_LABELS[slot]} reading for this date.` };

  const updated = await prisma.glucoseReading.update({
    where: { id },
    data: { readingDate: date, timeSlot: slot, value: value ?? existing.value },
  });
  await invalidateCache(userId);
  return updated;
};

const remove = async (userId, id) => {
  await getOne(userId, id);
  await prisma.glucoseReading.delete({ where: { id } });
  await invalidateCache(userId);
};

module.exports = { getAll, getOne, create, update, remove };
