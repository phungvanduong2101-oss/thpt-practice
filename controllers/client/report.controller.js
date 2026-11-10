const Report = require("../../models/report.model");
const Group = require("../../models/group.model");
const Account = require("../../models/account.model");
const notifications = require("../../services/notification.service");
const { resolveTarget, same, valid, fail, reasons, statuses, types } = require("../../services/report");
const isAdminPage = req => req.baseUrl === "/admin/reports";
const base = req => isAdminPage(req) ? "/admin/reports" : "/reports";
exports.create = async (req, res) => {
  const reason = req.body.reason;
  const description = typeof req.body.description === "string" ? req.body.description.trim() : "";
  if (typeof reason !== "string" || !Object.hasOwn(reasons, reason) || description.length > 2000 || (reason === "other" && !description))
    fail(400, "Chọn lý do hợp lệ; lý do khác cần mô tả. Tối đa 2.000 ký tự.");
  const target = await resolveTarget(req.body, req.account);
  const recent = await Report.countDocuments({ reporterId: req.account._id, createdAt: { $gte: new Date(Date.now() - 3600000) } });
  if (recent >= 10) fail(429, "Bạn đã gửi nhiều báo cáo. Vui lòng thử lại sau.");
  const recipients = target.scope === "group"
    ? await Account.find({ _id: target.recipientId, status: "active" }).select("_id").lean()
    : await Account.find({ role: "admin", status: "active" }).select("_id").lean();
  if (!recipients.length) fail(503, "Hiện chưa có người tiếp nhận báo cáo. Vui lòng thử lại sau.");
  const openKey = [req.account._id, target.targetType, target.targetId, target.scope, target.groupId || "system"].join(":");
  let report;
  try { report = await Report.create({ ...target, reporterId: req.account._id, reason, description, openKey }); }
  catch (error) {
    if (error.code === 11000) fail(409, "Bạn đã báo cáo nội dung này và báo cáo vẫn đang được xử lý.");
    throw error;
  }
  const prefix = target.scope === "group" ? "/reports/" : "/admin/reports/";
  const results = await Promise.allSettled(recipients.map(person => notifications.send(req.app.get("io"), {
    recipientId: person._id, senderId: req.account._id, type: "report_received",
    content: ("Bạn nhận được báo cáo mới về " + types[target.targetType].toLowerCase() + ": " + target.snapshot.title).slice(0, 500),
    link: prefix + report._id,
  })));
  results.forEach(result => { if (result.status === "rejected") console.error("Thông báo báo cáo:", result.reason); });
  res.status(201).json({ message: "Đã gửi báo cáo tới " + (target.scope === "group" ? "chủ nhóm." : "admin."), redirectUrl: "/reports/" + report._id });
};
async function managerFilter(req) {
  if (isAdminPage(req)) return { scope: "system" };
  const groups = await Group.find({ ownerId: req.account._id }).select("_id").lean();
  return { scope: "group", groupId: { $in: groups.map(g => g._id) } };
}
exports.list = async (req, res) => {
  const sent = !isAdminPage(req) && req.query.box === "sent";
  const filter = sent ? { reporterId: req.account._id } : await managerFilter(req);
  const status = Object.hasOwn(statuses, req.query.status) ? req.query.status : "";
  const type = Object.hasOwn(types, req.query.type) ? req.query.type : "";
  if (status) filter.status = status;
  if (type) filter.targetType = type;
  let group = null;
  if (!sent && !isAdminPage(req) && req.query.group) {
    if (!valid(req.query.group)) fail(400, "Nhóm không hợp lệ.");
    group = await Group.findOne({ _id: req.query.group, ownerId: req.account._id }).lean();
    if (!group) fail(403, "Chỉ chủ nhóm được xem báo cáo của nhóm.");
    filter.groupId = group._id;
  }
  const total = await Report.countDocuments(filter), pages = Math.max(1, Math.ceil(total / 15));
  const requested = Number(req.query.page), page = Math.min(pages, Number.isSafeInteger(requested) && requested > 0 ? requested : 1);
  const reports = await Report.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * 15).limit(15).populate("reporterId", "fullName").lean();
  const pageUrl = value => base(req) + "?" + new URLSearchParams({ box: sent ? "sent" : "received", status, type, ...(group ? { group: String(group._id) } : {}), page: value });
  res.render(isAdminPage(req) ? "admin/reports" : "client/reports", {
    title: "Quản lý báo cáo", activePage: "reports", reports, total, pages, page, pageUrl,
    statuses, reasons, types, status, type, sent, group, reportBase: base(req), adminView: isAdminPage(req),
  });
};
exports.load = async (req, res, next) => {
  if (!valid(req.params.reportId)) fail(404, "Không tìm thấy báo cáo.");
  const report = await Report.findById(req.params.reportId).populate("reporterId", "fullName").populate("handledBy", "fullName").lean();
  if (!report) fail(404, "Không tìm thấy báo cáo.");
  const group = report.scope === "group" ? await Group.findById(report.groupId).lean() : null;
  const canManage = isAdminPage(req) ? report.scope === "system" : Boolean(group && same(group.ownerId, req.account._id));
  const own = same(report.reporterId?._id, req.account._id);
  if (!canManage && (!own || isAdminPage(req))) fail(403, "Bạn không có quyền xem báo cáo này.");
  req.report = report; req.canManageReport = canManage;
  next();
};
exports.detail = (req, res) => res.render(isAdminPage(req) ? "admin/report-detail" : "client/report-detail", {
  title: "Chi tiết báo cáo", activePage: "reports", report: req.report, canManage: req.canManageReport,
  statuses, reasons, types, reportBase: base(req),
});
exports.update = async (req, res) => {
  if (!req.canManageReport) fail(403, "Bạn không có quyền xử lý báo cáo.");
  const status = req.body.status, note = typeof req.body.resolution === "string" ? req.body.resolution.trim() : "";
  if (!["pending", "reviewing"].includes(req.report.status)) fail(409, "Báo cáo đã đóng.");
  if (!["reviewing", "resolved", "rejected"].includes(status) || note.length > 2000 || (["resolved", "rejected"].includes(status) && !note))
    fail(400, "Chọn trạng thái hợp lệ và nhập ghi chú kết quả khi đóng báo cáo (tối đa 2.000 ký tự).");
  const closed = status === "resolved" || status === "rejected";
  const result = await Report.updateOne({ _id: req.report._id, status: req.report.status, updatedAt: req.report.updatedAt }, {
    $set: { status, resolution: note, handledBy: req.account._id, handledAt: new Date() },
    ...(closed ? { $unset: { openKey: "" } } : {}),
  }, { runValidators: true });
  if (!result.matchedCount) fail(409, "Báo cáo vừa được người khác cập nhật. Hãy tải lại trang.");
  if (closed && req.report.reporterId) {
    try { await notifications.send(req.app.get("io"), {
      recipientId: req.report.reporterId._id, senderId: req.account._id, type: "report_updated",
      content: "Báo cáo của bạn đã có kết quả: " + statuses[status] + ".", link: "/reports/" + req.report._id,
    }); } catch (error) { console.error("Thông báo kết quả báo cáo:", error); }
  }
  res.json({ message: "Đã cập nhật báo cáo.", redirectUrl: base(req) + "/" + req.report._id });
};
exports.error = (error, req, res, next) => {
  const status = error.status || (error.name === "CastError" ? 400 : 500);
  if (status === 500) console.error("Báo cáo:", error);
  const message = status === 500 ? "Không thể xử lý báo cáo. Vui lòng thử lại." : error.message;
  if (req.get("Accept")?.includes("application/json")) return res.status(status).json({ message });
  res.status(status).send(message);
};
