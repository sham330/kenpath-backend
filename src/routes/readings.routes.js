const { Router } = require('express');
const { authenticate } = require('../middlewares/auth.middleware');
const { getAll, getOne, create, update, remove } = require('../controllers/readings.controller');

const router = Router();

router.use(authenticate);

router.get('/', getAll);
router.get('/:id', getOne);
router.post('/', create);
router.patch('/:id', update);
router.delete('/:id', remove);

module.exports = router;
