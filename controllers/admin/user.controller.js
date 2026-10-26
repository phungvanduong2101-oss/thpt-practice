const mongoose = require("mongoose");
const Account = require("../../models/account.model");

const validId = id => mongoose.isObjectIdOrHexString(id);

module.exports.index = async (req, res, next) => {
  try {
    const keyword = typeof req.query.keyword === "string" ? req.query.keyword.trim() : "";
    const role = ["user", "admin"].includes(req.query.role) ? req.query.role : "all";
    const status = ["active", "inactive"].includes(req.query.status) ? req.query.status : "all";
    const filter = {};
    if (keyword) {
      const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = ["fullName", "email"].map(field => ({ [field]: { $regex: escaped, $options: "i" } }));
    }
    if (role !== "all") filter.role = role;
    if (status !== "all") filter.status = status;
    const limit = 10;
    const [totalItems, totalUsers, activeUsers, adminUsers] = await Promise.all([
      Account.countDocuments(filter), Account.countDocuments(),
      Account.countDocuments({ status: "active" }), Account.countDocuments({ role: "admin" }),
    ]);
    const totalPages = Math.max(1, Math.ceil(totalItems / limit));
    const requested = Number(req.query.page);
    const currentPage = Math.min(totalPages, Number.isSafeInteger(requested) && requested > 0 ? requested : 1);
    const skip = (currentPage - 1) * limit;
    const users = await Account.find(filter).select("fullName email role status createdAt")
      .sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean();
    const pageUrl = page => `/admin/users?${new URLSearchParams({ keyword, role, status, page: String(page) })}`;
    res.render("admin/users", {
      title: "Quản lý người dùng", activePage: "users", users,
      keyword, role, status, totalItems, totalUsers, activeUsers, adminUsers,
      currentPage, totalPages, startItem: totalItems ? skip + 1 : 0,
      endItem: skip + users.length, skip, pageUrl,
    });
  } catch (error) { next(error); }
};

module.exports.update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const reject = message => res.status(400).json({ code: "error", message });
    if (!validId(id)) return reject("ID người dùng không hợp lệ.");
    const fullName = typeof req.body.fullName === "string" ? req.body.fullName.trim() : "";
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const { role } = req.body;
    if (fullName.length < 2 || fullName.length > 80) return reject("Họ tên phải từ 2 đến 80 ký tự.");
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reject("Email không hợp lệ.");
    if (!["user", "admin"].includes(role)) return reject("Vai trò không hợp lệ.");
    if (String(req.account._id).toLowerCase() === String(id).toLowerCase() && role !== "admin") return reject("Không thể tự bỏ quyền quản trị của mình.");
    const user = await Account.findOneAndUpdate({ _id: id }, { $set: { fullName, email, role } }, { new: true, runValidators: true })
      .select("_id").lean();
    if (!user) return res.status(404).json({ code: "error", message: "Người dùng không tồn tại." });
    return res.json({ code: "success", message: "Đã cập nhật người dùng." });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ code: "error", message: "Email đã được sử dụng." });
    if (error.name === "ValidationError") return res.status(400).json({ code: "error", message: "Thông tin người dùng không hợp lệ." });
    next(error);
  }
};

module.exports.status = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!validId(id) || !["active", "inactive"].includes(status)) {
      return res.status(400).json({ code: "error", message: "Dữ liệu trạng thái không hợp lệ." });
    }
    if (String(req.account._id).toLowerCase() === String(id).toLowerCase() && status === "inactive") {
      return res.status(400).json({ code: "error", message: "Không thể tự khóa tài khoản đang đăng nhập." });
    }
    const user = await Account.findOneAndUpdate({ _id: id }, { $set: { status } }, { new: true, runValidators: true })
      .select("_id").lean();
    if (!user) return res.status(404).json({ code: "error", message: "Người dùng không tồn tại." });
    if (status === "inactive") req.app.get("io")?.in(`account:${id.toLowerCase()}`).disconnectSockets(true);
    return res.json({ code: "success", message: status === "inactive" ? "Đã khóa tài khoản." : "Đã mở khóa tài khoản." });
  } catch (error) { next(error); }
};
