const router = require('express').Router();
const controller = require('../../controllers/client/personal-question.controller');
const auth = require('../../middlewares/auth.middleware');
router.use(auth.requireAuth);
router.get('/', controller.index);
router.post('/create', controller.create);
router.patch('/:questionId', controller.update);
router.delete('/:questionId', controller.remove);
module.exports = router;
