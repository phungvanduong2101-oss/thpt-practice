const jwt = require("jsonwebtoken");
const Account = require("../models/account.model");

// Đọc tài khoản nếu đã đăng nhập.
// Khách vẫn được xem các trang công khai.
module.exports.optionalAuth = async (req, res, next) => {
  req.account = null;
  res.locals.currentAccount = null;

  const token = req.cookies?.token;

  if (!token) {
    return next();
  }

  let payload;

  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    if (
      error.name === "TokenExpiredError" ||
      error.name === "JsonWebTokenError" ||
      error.name === "NotBeforeError"
    ) {
      res.clearCookie("token", { path: "/" });
      return next();
    }

    return next(error);
  }

  if (
    typeof payload.id !== "string" ||
    !/^[a-fA-F0-9]{24}$/.test(payload.id)
  ) {
    res.clearCookie("token", { path: "/" });
    return next();
  }

  try {
    const account = await Account.findById(payload.id)
      .select("-password");

    if (account && account.status === "active") {
      req.account = account;
      res.locals.currentAccount = account;
    }

    return next();
  } catch (error) {
    return next(error);
  }
};

// Chạy sau optionalAuth.
module.exports.requireAuth = (req, res, next) => {
  if (req.account) {
    return next();
  }

  if (req.get("Accept")?.includes("application/json")) {
    return res.status(401).json({
      code: "error",
      message: "Vui lòng đăng nhập để tiếp tục.",
    });
  }

  return res.redirect("/auth/login");
};

// Chạy sau requireAuth.
module.exports.requireAdmin = (req, res, next) => {
  if (req.account.role !== "admin") {
    if (req.get("Accept")?.includes("application/json")) {
      return res.status(403).json({
        code: "error",
        message: "Bạn không có quyền truy cập.",
      });
    }

    return res.status(403).send("Bạn không có quyền truy cập.");
  }

  return next();
};