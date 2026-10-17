const jwt = require("jsonwebtoken");
const Account = require("../../models/account.model");

module.exports.requireAuth = async (req, res, next) => {
  // Fetch gửi Accept: application/json sẽ nhận JSON thay vì redirect.
  const unauthorized = () => {
    if (req.get("Accept")?.includes("application/json")) {
      return res.status(401).json({
        code: "error",
        message: "Vui lòng đăng nhập để tiếp tục!",
      });
    }

    return res.redirect("/auth/login");
  };

  const token = req.cookies?.token;

  if (!token) {
    return unauthorized();
  }

  let decoded;

  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    res.clearCookie("token", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });

    return unauthorized();
  }

  try {
    const account = await Account.findById(decoded.id)
      .select("-password");

    if (!account || account.status !== "active") {
      return unauthorized();
    }

    req.account = account;
    res.locals.currentAccount = account;

    return next();
  } catch (error) {
    return next(error);
  }
}; 

module.exports.optionalAuth = async (req, res, next) => {
  req.account = null;
  res.locals.currentAccount = null;

  const token = req.cookies?.token;

  // Chưa đăng nhập vẫn được xem trang.
  if (!token) return next();

  let decoded;

  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    if (
      error.name === "TokenExpiredError" ||
      error.name === "JsonWebTokenError" ||
      error.name === "NotBeforeError"
    ) {
      res.clearCookie("token", {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      });

      return next();
    }

    return next(error);
  }

  if (
    typeof decoded?.id !== "string" ||
    !/^[a-fA-F0-9]{24}$/.test(decoded.id)
  ) {
    return next();
  }

  try {
    const account = await Account.findById(decoded.id)
      .select("fullName email role status");

    if (account && account.status === "active") {
      req.account = account;
      res.locals.currentAccount = account;
    }

    return next();
  } catch (error) {
    return next(error);
  }
};