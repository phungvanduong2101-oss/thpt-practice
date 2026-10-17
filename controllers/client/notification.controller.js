const Notification = require("../../models/notification.model");

module.exports.index = async (req, res, next) => {
  try {
    const recipientId = req.account._id;

    const [notifications, unreadCount] = await Promise.all([
      Notification.find({ recipientId })
        .select("type content link isRead createdAt")
        .sort({ createdAt: -1, _id: -1 })
        .limit(20)
        .lean(),

      Notification.countDocuments({
        recipientId,
        isRead: false,
      }),
    ]);

    return res.json({
      code: "success",
      notifications,
      unreadCount,
    });
  } catch (error) {
    return next(error);
  }
};

module.exports.read = async (req, res, next) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      {
        _id: req.params.id,
        recipientId: req.account._id,
      },
      {
        $set: {
          isRead: true,
        },
      },
      { new: true }
    ).select("_id link isRead");

    if (!notification) {
      return res.status(404).json({
        code: "error",
        message: "Không tìm thấy thông báo.",
      });
    }

    const unreadCount = await Notification.countDocuments({
      recipientId: req.account._id,
      isRead: false,
    });

    // Đồng bộ số chưa đọc trên các tab của cùng tài khoản.
    req.app.get("io")
      .to(`account:${String(req.account._id)}`)
      .emit("notification:read", {
        notificationId: notification._id,
      });

    return res.json({
      code: "success",
      notification,
      unreadCount,
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        code: "error",
        message: "ID thông báo không hợp lệ.",
      });
    }

    return next(error);
  }
};