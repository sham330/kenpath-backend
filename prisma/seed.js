const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

const readings = [
  { daysAgo: 0, timeSlot: 'MORNING', value: 95 },
  { daysAgo: 0, timeSlot: 'AFTER_BREAKFAST', value: 145 },
  { daysAgo: 0, timeSlot: 'AFTER_LUNCH', value: 160 },
  { daysAgo: 1, timeSlot: 'MORNING', value: 88 },
  { daysAgo: 1, timeSlot: 'AFTER_BREAKFAST', value: 132 },
  { daysAgo: 1, timeSlot: 'AFTER_LUNCH', value: 155 },
  { daysAgo: 1, timeSlot: 'AFTER_DINNER', value: 140 },
  { daysAgo: 2, timeSlot: 'MORNING', value: 102 },
  { daysAgo: 2, timeSlot: 'AFTER_BREAKFAST', value: 178 },
  { daysAgo: 3, timeSlot: 'MORNING', value: 91 },
  { daysAgo: 3, timeSlot: 'AFTER_DINNER', value: 148 },
  { daysAgo: 4, timeSlot: 'MORNING', value: 85 },
  { daysAgo: 4, timeSlot: 'AFTER_LUNCH', value: 162 },
  { daysAgo: 5, timeSlot: 'MORNING', value: 99 },
  { daysAgo: 5, timeSlot: 'AFTER_BREAKFAST', value: 141 },
];

const toDate = (daysAgo) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d;
};

async function main() {
  const password = await bcrypt.hash('Test1234!', 12);

  const user = await prisma.user.upsert({
    where: { email: 'test@example.com' },
    update: {},
    create: { name: 'Test User', email: 'test@example.com', password },
  });

  await prisma.glucoseReading.deleteMany({ where: { userId: user.id } });

  await prisma.glucoseReading.createMany({
    data: readings.map(({ daysAgo, timeSlot, value }) => ({
      userId: user.id,
      readingDate: toDate(daysAgo),
      timeSlot,
      value,
    })),
  });

  console.log(`Seeded user: test@example.com / Test1234!`);
  console.log(`Seeded ${readings.length} glucose readings`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
