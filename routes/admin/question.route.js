const express = require("express");
const router = express.Router();

const controller = require("../../controllers/admin/question.controller");
const uploadImage = require("../../middlewares/upload-image.middleware");
const uploadController = require("../../controllers/admin/upload.controller");

router.get("/", controller.index);

router.post(
  "/images",
  (req, res, next) => {
    uploadImage.single("image")(req, res, (error) => {
      if (error) {
        return res.status(400).json({
          message:
            error.code === "LIMIT_FILE_SIZE"
              ? "Ảnh không được vượt quá 3 MB."
              : error.message,
        });
      }

      next();
    });
  },
  uploadController.uploadImage
);

router.post("/create", controller.create);
router.delete("/:id", controller.delete);

module.exports = router;