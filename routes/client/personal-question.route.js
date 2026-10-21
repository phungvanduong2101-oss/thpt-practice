const router = require('express').Router();

const controller = require('../../controllers/client/personal-question.controller');
const auth = require('../../middlewares/auth.middleware');

const uploadImage = require('../../middlewares/upload-image.middleware');
const uploadController = require('../../controllers/admin/upload.controller');

router.use(auth.requireAuth);

router.get('/', controller.index);

router.post(
  '/images',
  (req, res, next) => {
    uploadImage.single('image')(req, res, error => {
      if (error) {
        return res.status(400).json({
          message:
            error.code === 'LIMIT_FILE_SIZE'
              ? 'Ảnh không được vượt quá 3 MB.'
              : error.message,
        });
      }

      next();
    });
  },
  uploadController.uploadImage
);

router.post('/create', controller.create);
router.patch('/:questionId', controller.update);
router.delete('/:questionId', controller.remove);

module.exports = router;