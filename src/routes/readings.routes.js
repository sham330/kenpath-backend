const { Router } = require('express');
const { authenticate } = require('../middlewares/auth.middleware');
const { getAll, getOne, create, update, remove } = require('../controllers/readings.controller');
const { getReport } = require('../controllers/reports.controller');

const router = Router();

router.use(authenticate);

router.get('/', getAll);
router.get('/reports', getReport);
router.get('/:id', getOne);
router.post('/', create);
router.patch('/:id', update);
router.delete('/:id', remove);

module.exports = router;
