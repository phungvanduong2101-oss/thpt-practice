const Notification = require("../models/notification.model");

module.exports.send = async (io, {
  recipientId,
  senderId = null,
  type,
  content,
  link,
}) => {
  // Lưu trước để người offline vẫn xem được khi vào lại.
  const notification = await Notification.create({
    recipientId,
    senderId,
    type,
    content,
    link,
  });

  io.to(`account:${String(recipientId)}`).emit(
    "notification:new",
    {
      _id: notification._id,
      type: notification.type,
      content: notification.content,
      link: notification.link,
      isRead: notification.isRead,
      createdAt: notification.createdAt,
    }
  );

  return notification;
};