const router = require('express').Router();
const auth = require('../../middlewares/auth.middleware');
const controller = require('../../controllers/client/practice.controller');
router.use(auth.requireAuth);
router.get('/', controller.index);
router.post('/', controller.create);
router.get('/:attemptId', controller.detail);
router.post('/:attemptId/start', controller.start);
module.exports = router;
