const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");

const Account = require("../models/account.model");

module.exports = server => {
  const io = new Server(server);

  // Đọc cookie khi thiết lập kết nối.
  io.engine.use(cookieParser());

  // Xác thực tài khoản trước khi cho kết nối socket.
  io.use(async (socket, next) => {
    try {
      const token = socket.request.cookies?.token;

      if (!token) {
        return next(new Error("Vui lòng đăng nhập."));
      }

      const payload = jwt.verify(
        token,
        process.env.JWT_SECRET
      );

      if (typeof payload.id !== "string") {
        return next(new Error("Token không hợp lệ."));
      }

      const account = await Account.findById(payload.id)
        .select("_id status")
        .lean();

      if (!account || account.status !== "active") {
        return next(new Error("Tài khoản không khả dụng."));
      }

      socket.data.accountId = String(account._id);

      return next();
    } catch (error) {
      return next(new Error("Không thể xác thực kết nối."));
    }
  });

  io.on("connection", socket => {
    const accountId = socket.data.accountId;

    // Server tự xác định room, không lấy accountId từ client.
    socket.join(`account:${accountId}`);
  });

  return io;
};