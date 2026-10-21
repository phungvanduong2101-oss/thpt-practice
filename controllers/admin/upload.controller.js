// Sửa đường dẫn này cho đúng file cấu hình của m
const cloudinary = require("../../config/cloudinary");

module.exports.uploadImage = (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      message: "Vui lòng chọn ảnh.",
    });
  }

  const stream = cloudinary.uploader.upload_stream(
    {
      folder: "thpt-practice/questions",
      resource_type: "image",
      allowed_formats: ["jpg", "jpeg", "png", "webp", "gif"],
    },
    (error, result) => {
      if (error) {
        console.error("Upload question image:", error);

        return res.status(500).json({
          message: "Upload ảnh thất bại.",
        });
      }

      return res.json({
        url: result.secure_url,
        publicId: result.public_id,
      });
    }
  );

  stream.end(req.file.buffer);
};