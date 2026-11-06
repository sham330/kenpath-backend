const Joi = require('joi');
const readingsService = require('../services/readings.service');

const VALID_SLOTS = ['MORNING', 'AFTER_BREAKFAST', 'AFTER_LUNCH', 'AFTER_DINNER'];

const createSchema = Joi.object({
  readingDate: Joi.date().iso().required(),
  timeSlot: Joi.string().valid(...VALID_SLOTS).required(),
  value: Joi.number().integer().min(40).max(600).required().messages({
    'any.required': 'Please enter a glucose value.',
    'number.base': 'Please enter a glucose value.',
    'number.integer': 'Value must be between 40 and 600 mg/dl.',
    'number.min': 'Value must be between 40 and 600 mg/dl.',
    'number.max': 'Value must be between 40 and 600 mg/dl.',
  }),
});

const updateSchema = Joi.object({
  readingDate: Joi.date().iso(),
  timeSlot: Joi.string().valid(...VALID_SLOTS),
  value: Joi.number().integer().min(40).max(600).messages({
    'number.integer': 'Value must be between 40 and 600 mg/dl.',
    'number.min': 'Value must be between 40 and 600 mg/dl.',
    'number.max': 'Value must be between 40 and 600 mg/dl.',
  }),
}).min(1);

const handle = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};

const getAll = handle(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const result = await readingsService.getAll(req.user.sub, page);
  res.json(result);
});

const getOne = handle(async (req, res) => {
  const reading = await readingsService.getOne(req.user.sub, req.params.id);
  res.json(reading);
});

const create = handle(async (req, res) => {
  const { error, value } = createSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  const reading = await readingsService.create(req.user.sub, value);
  res.status(201).json(reading);
});

const update = handle(async (req, res) => {
  const { error, value } = updateSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  const reading = await readingsService.update(req.user.sub, req.params.id, value);
  res.json(reading);
});

const remove = handle(async (req, res) => {
  await readingsService.remove(req.user.sub, req.params.id);
  res.status(204).send();
});

module.exports = { getAll, getOne, create, update, remove };
