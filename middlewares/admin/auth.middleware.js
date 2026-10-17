const jwt = require("jsonwebtoken");
const Account = require("../../models/account.model");

module.exports.requireAdmin = async (req, res, next) => {
  const token = req.cookies.token;

  if (!token) {
    return res.redirect("/admin/auth/login");
  }

  let payload;

  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    res.clearCookie("token", { path: "/" });
    return res.redirect("/admin/auth/login");
  }

  try {
    const account = await Account.findById(payload.accountId);

    if (!account || account.status !== "active") {
      res.clearCookie("token", { path: "/" });
      return res.redirect("/admin/auth/login");
    }

    if (account.role !== "admin") {
      return res.status(403).send("Bạn không có quyền truy cập.");
    }

    req.account = account;
    res.locals.currentAccount = account;

    next();
  } catch (error) {
    next(error);
  }
}; 

