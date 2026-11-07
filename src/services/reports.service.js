const prisma = require('../lib/prisma');

const SLOT_LABELS = {
  MORNING: 'Morning (fasting)',
  AFTER_BREAKFAST: 'After breakfast',
  AFTER_LUNCH: 'After lunch',
  AFTER_DINNER: 'After dinner',
};

const toUTCDate = (dateStr) => {
  const d = new Date(dateStr);
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

const getDateRange = (type, date) => {
  const selected = toUTCDate(date);

  if (type === 'daily') {
    return { from: selected, to: selected, label: selected.toISOString().split('T')[0] };
  }

  if (type === 'mtd') {
    const from = new Date(Date.UTC(selected.getUTCFullYear(), selected.getUTCMonth(), 1));
    return {
      from,
      to: selected,
      label: `${from.toISOString().split('T')[0]} to ${selected.toISOString().split('T')[0]}`,
    };
  }

  if (type === 'monthly') {
    const from = new Date(Date.UTC(selected.getUTCFullYear(), selected.getUTCMonth(), 1));
    const to = new Date(Date.UTC(selected.getUTCFullYear(), selected.getUTCMonth() + 1, 0));
    return {
      from,
      to,
      label: `${from.toISOString().split('T')[0]} to ${to.toISOString().split('T')[0]}`,
    };
  }

  throw { status: 400, message: 'Invalid report type. Use daily, mtd, or monthly.' };
};

const buildStats = (readings) => {
  if (!readings.length) return null;

  const values = readings.map((r) => r.value);
  const highest = Math.max(...values);
  const lowest = Math.min(...values);
  const average = Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;

  // For recharts: group by date with slot values
  const chartData = Object.values(
    readings.reduce((acc, r) => {
      const day = r.readingDate.toISOString().split('T')[0];
      if (!acc[day]) acc[day] = { date: day };
      acc[day][r.timeSlot] = r.value;
      return acc;
    }, {})
  );

  return { highest, lowest, average, count: readings.length, chartData };
};

const getReport = async (userId, type, date) => {
  const { from, to, label } = getDateRange(type, date);

  const readings = await prisma.glucoseReading.findMany({
    where: {
      userId,
      readingDate: { gte: from, lte: to },
    },
    orderBy: [{ readingDate: 'asc' }, { timeSlot: 'asc' }],
  });

  const stats = buildStats(readings);

  if (!stats) {
    return {
      type,
      label,
      empty: true,
      message: 'No readings found for this period. Start logging to see your report.',
    };
  }

  const result = { type, label, empty: false, ...stats };

  // Daily: also include each reading with slot label
  if (type === 'daily') {
    result.readings = readings.map((r) => ({
      id: r.id,
      timeSlot: r.timeSlot,
      slotLabel: SLOT_LABELS[r.timeSlot],
      value: r.value,
    }));
  }

  return result;
};

module.exports = { getReport };
