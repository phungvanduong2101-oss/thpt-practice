const multer = require("multer");

const uploadImage = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 3 * 1024 * 1024, // Tối đa 3 MB/ảnh
  },

  fileFilter(req, file, cb) {
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
    ];

    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error("Chỉ nhận ảnh JPG, PNG, WEBP hoặc GIF."));
    }

    cb(null, true);
  },
});

module.exports = uploadImage;