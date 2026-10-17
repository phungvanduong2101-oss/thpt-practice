const mongoose = require("mongoose");

const { Schema } = mongoose;

const notificationSchema = new Schema(
  {
    recipientId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },

    senderId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      default: null,
    },

    type: {
      type: String,
      enum: [
        "group_join_request",
        "group_join_approved",
        "group_join_rejected",
        "group_exam_published",
      ],
      required: true,
    },

    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },

    // Đường dẫn mở khi nhấn vào thông báo.
    link: {
      type: String,
      required: true,
    },

    isRead: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Lấy thông báo của tài khoản, mới nhất trước.
notificationSchema.index({
  recipientId: 1,
  createdAt: -1,
  _id: -1,
});

// Đếm thông báo chưa đọc.
notificationSchema.index({
  recipientId: 1,
  isRead: 1,
});

module.exports = mongoose.model(
  "Notification",
  notificationSchema,
  "notifications"
);