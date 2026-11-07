const reportsService = require('../services/reports.service');

const getReport = async (req, res) => {
  try {
    const { type, date } = req.query;

    if (!type) return res.status(400).json({ error: 'Query param "type" is required. Use daily, mtd, or monthly.' });
    if (!date) return res.status(400).json({ error: 'Query param "date" is required. Format: YYYY-MM-DD.' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });

    const result = await reportsService.getReport(req.user.sub, type, date);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};

module.exports = { getReport };
