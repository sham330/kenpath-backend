const Joi = require('joi');
const authService = require('../services/auth.service');

const registerSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

const register = async (req, res) => {
  const { error, value } = registerSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  try {
    const user = await authService.register(value);
    res.status(201).json({ user });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};

const login = async (req, res) => {
  const { error, value } = loginSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  try {
    const data = await authService.login(value);
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};

module.exports = { register, login };
