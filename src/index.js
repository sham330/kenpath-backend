const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const authRoutes = require('./routes/auth.routes');

const app = express();

// Security headers
app.use(helmet());

// Body parser with size limit
app.use(express.json({ limit: '10kb' }));

// Rate limiting
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: { error: 'Too many requests, please try again later' },
}));

// Stricter limiter for auth routes
app.use('/api/auth', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many auth attempts, please try again later' },
}));

// Routes
app.use('/api/auth', authRoutes);

// 404
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// Global error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
