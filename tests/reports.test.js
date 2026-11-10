const { test } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const express = require("express");
const Group = require("../models/group.model");
const Exam = require("../models/exam.model");
const Subject = require("../models/subject.model");
const ExamComment = require("../models/exam-comment.model");
const { Post, Comment } = require("../models/post.model");
const Account = require("../models/account.model");
const Report = require("../models/report.model");
const Notification = require("../models/notification.model");
const c = require("../controllers/client/report.controller");
const { resolveTarget } = require("../services/report");
const id = () => new mongoose.Types.ObjectId().toString();
const owner = id(), member = id(), outsider = id(), admin = id(), gid = id(), eid = id(), pid = id(), cid = id(), rid = id();
const group = { _id: gid, ownerId: owner, memberIds: [member], status: "active", name: "Nhóm Toán", description: "Giới thiệu" };
const exam = { _id: eid, title: "Đề Toán", subjectId: id(), description: "Mô tả đề" };
const query = value => ({ lean: async () => value, select() { return this; }, populate() { return this; }, sort() { return this; }, skip() { return this; }, limit() { return this; } });
function targets(t) {
  t.mock.method(Group, "findById", () => query(group));
  t.mock.method(Exam, "findOne", () => query(exam));
  t.mock.method(Subject, "exists", async () => ({ _id: exam.subjectId }));
  t.mock.method(Post, "findOne", () => query({ _id: pid, groupId: gid, content: "Bài viết" }));
  t.mock.method(Comment, "findOne", () => query({ _id: cid, postId: pid, content: "Bình luận nhóm" }));
  t.mock.method(ExamComment, "findById", () => query({ _id: cid, examId: eid, groupId: gid, content: "Bình luận đề nhóm" }));
}
async function rejected(work, status) { await assert.rejects(work, e => e.status === status); }

test("Báo cáo cả nhóm luôn gửi admin, kể cả khi client giả scope/recipient", async t => {
  targets(t);
  const result = await resolveTarget({ targetType: "group", targetId: gid, scope: "group", recipientId: outsider }, { _id: outsider });
  assert.equal(result.scope, "system"); assert.equal(result.recipientId, null);
  assert.equal(result.snapshot.url, "/groups/" + gid);
});
test("Báo cáo đề hệ thống và đề trong nhóm định tuyến đúng", async t => {
  targets(t);
  const system = await resolveTarget({ targetType: "exam", targetId: eid }, { _id: outsider });
  assert.equal(system.scope, "system");
  assert.equal(Exam.findOne.mock.calls[0].arguments[0].scope, "system");
  const local = await resolveTarget({ targetType: "exam", targetId: eid, groupId: gid }, { _id: member });
  assert.equal(local.scope, "group"); assert.equal(String(local.recipientId), owner);
  assert.equal(String(Exam.findOne.mock.calls[1].arguments[0].groupIds), gid);
});
test("Bài viết và bình luận bài viết lấy nhóm từ DB, không tin dữ liệu client", async t => {
  targets(t);
  for (const targetType of ["post", "post_comment"]) {
    const r = await resolveTarget({ targetType, targetId: targetType === "post" ? pid : cid }, { _id: member });
    assert.equal(r.scope, "group"); assert.equal(String(r.recipientId), owner);
    await rejected(resolveTarget({ targetType, targetId: pid, groupId: id() }, { _id: member }), 400);
  }
});
test("Bình luận đề lấy phạm vi từ bình luận gốc", async t => {
  targets(t);
  const r = await resolveTarget({ targetType: "exam_comment", targetId: cid, scope: "system" }, { _id: member });
  assert.equal(r.scope, "group"); assert.equal(String(r.recipientId), owner);
  t.mock.method(ExamComment, "findById", () => query({ _id: cid, examId: eid, groupId: null, content: "Công khai" }));
  const global = await resolveTarget({ targetType: "exam_comment", targetId: cid }, { _id: outsider });
  assert.equal(global.scope, "system");
  await rejected(resolveTarget({ targetType: "exam_comment", targetId: cid, groupId: gid }, { _id: member }), 400);
});
test("Người ngoài không báo cáo được nội dung riêng trong nhóm", async t => {
  targets(t);
  for (const targetType of ["exam", "post", "post_comment", "exam_comment"]) {
    await rejected(resolveTarget({ targetType, targetId: eid, groupId: gid }, { _id: outsider }), 403);
  }
});
test("ID sai, nội dung bị xóa và đề không khả dụng bị từ chối", async t => {
  targets(t);
  await rejected(resolveTarget({ targetType: "post", targetId: "invalid" }, { _id: member }), 400);
  t.mock.method(Post, "findOne", () => query(null));
  await rejected(resolveTarget({ targetType: "post", targetId: pid }, { _id: member }), 404);
  t.mock.method(Subject, "exists", async () => null);
  await rejected(resolveTarget({ targetType: "exam", targetId: eid }, { _id: member }), 404);
});
function report(overrides = {}) {
  return { _id: rid, reporterId: { _id: member, fullName: "Học sinh" }, targetType: "post", targetId: pid,
    scope: "group", groupId: gid, recipientId: owner, snapshot: { title: "Bài viết", content: "Nội dung", url: "/groups/" + gid },
    status: "pending", reason: "spam", description: "", updatedAt: new Date("2026-11-10T00:00:00Z"), createdAt: new Date(), ...overrides };
}
test("Chỉ chủ nhóm và người gửi xem được chi tiết báo cáo nhóm; admin dùng inbox hệ thống không vượt phạm vi", async t => {
  targets(t); t.mock.method(Report, "findById", () => query(report()));
  for (const [accountId, baseUrl, allowed, manage] of [[owner,"/reports",true,true],[member,"/reports",true,false],[outsider,"/reports",false,false],[admin,"/admin/reports",false,false]]) {
    const req = { params: { reportId: rid }, account: { _id: accountId, role: accountId === admin ? "admin" : "user" }, baseUrl };
    if (allowed) { let next = false; await c.load(req, {}, () => next = true); assert.ok(next); assert.equal(req.canManageReport, manage); }
    else await rejected(c.load(req, {}, () => {}), 403);
  }
});
test("Báo cáo hệ thống chỉ admin xử lý; người báo cáo chỉ đọc", async t => {
  targets(t); t.mock.method(Report, "findById", () => query(report({ scope: "system", groupId: null })));
  const req = { params: { reportId: rid }, account: { _id: admin, role: "admin" }, baseUrl: "/admin/reports" };
  await c.load(req, {}, () => {}); assert.equal(req.canManageReport, true);
  const author = { ...req, baseUrl: "/reports", account: { _id: member } };
  await c.load(author, {}, () => {}); assert.equal(author.canManageReport, false);
});
test("Đóng báo cáo cần ghi chú, không cho người gửi hoặc người khác sửa trạng thái", async () => {
  const req = { report: report(), canManageReport: false, body: { status: "resolved", resolution: "Đã xem xét" } };
  await rejected(c.update(req, {}), 403);
  req.canManageReport = true; req.body.resolution = "";
  await rejected(c.update(req, {}), 400);
  req.report.status = "resolved";
  await rejected(c.update(req, {}), 409);
});
test("Đóng báo cáo gỡ khóa chống trùng và thông báo kết quả cho người gửi", async t => {
  let update, payload;
  t.mock.method(Report, "updateOne", async (filter, data) => { update = { filter, data }; return { matchedCount: 1 }; });
  t.mock.method(Notification, "create", async data => { payload = data; return { ...data, _id: id() }; });
  const events = [], io = { to: room => ({ emit: (event, data) => events.push({ room, event, data }) }) };
  await c.update({ report: report(), canManageReport: true, body: { status: "resolved", resolution: "Đã kiểm tra nội dung" }, account: { _id: owner }, baseUrl: "/reports", app: { get: () => io } }, { json: data => assert.equal(data.redirectUrl, "/reports/" + rid) });
  assert.ok(update.data.$unset); assert.equal(update.filter.status, "pending");
  assert.equal(String(payload.recipientId), member); assert.equal(payload.type, "report_updated");
  assert.equal(events[0].room, "account:" + member); assert.equal(events[0].event, "notification:new");
});
test("Cập nhật cạnh tranh trả 409, không gửi thông báo kết quả sai", async t => {
  t.mock.method(Report, "updateOne", async () => ({ matchedCount: 0 }));
  await rejected(c.update({ report: report(), canManageReport: true, body: { status: "resolved", resolution: "Đã xem" }, account: { _id: owner } }, {}), 409);
});
test("Tạo báo cáo gửi đúng thông báo lưu DB + socket cho mọi admin hoạt động", async t => {
  targets(t); const admins = [{ _id: admin }, { _id: id() }], payloads = [], events = [];
  t.mock.method(Account, "find", filter => { assert.deepEqual(filter, { role: "admin", status: "active" }); return query(admins); });
  t.mock.method(Report, "countDocuments", async () => 0);
  t.mock.method(Report, "create", async data => { assert.equal(data.scope, "system"); assert.ok(data.openKey); return { ...data, _id: rid }; });
  t.mock.method(Notification, "create", async data => { payloads.push(data); return { ...data, _id: id() }; });
  const req = { body: { targetType: "group", targetId: gid, reason: "spam", recipientId: outsider }, account: { _id: member }, app: { get: () => ({ to: room => ({ emit: event => events.push({ room, event }) }) }) } };
  let status; await c.create(req, { status: code => { status = code; return { json: data => assert.equal(data.redirectUrl, "/reports/" + rid) }; } });
  assert.equal(status, 201); assert.equal(payloads.length, 2); assert.equal(events.length, 2);
  assert.ok(payloads.every(p => p.type === "report_received" && p.link === "/admin/reports/" + rid));
});
test("Báo cáo nhóm thông báo riêng chủ nhóm; chống gửi trùng, spam và lý do sai", async t => {
  targets(t);
  t.mock.method(Account, "find", filter => { assert.equal(String(filter._id), owner); return query([{ _id: owner }]); });
  t.mock.method(Report, "countDocuments", async () => 0);
  t.mock.method(Report, "create", async () => { throw Object.assign(new Error("duplicate"), { code: 11000 }); });
  const req = { body: { targetType: "post", targetId: pid, reason: "spam" }, account: { _id: member } };
  await rejected(c.create(req, {}), 409);
  t.mock.method(Report, "countDocuments", async () => 10);
  await rejected(c.create(req, {}), 429);
  req.body.reason = "other";
  await rejected(c.create(req, {}), 400);
  req.body.reason = { $ne: "" };
  await rejected(c.create(req, {}), 400);
});
test("Các route nhận báo cáo bắt buộc đăng nhập và quyền admin", async t => {
  const app = express(); app.use(express.json());
  app.use((req, res, next) => { if(req.get("x-user")) req.account = { _id: req.get("x-user"), role: req.get("x-role") || "user" }; next(); });
  app.use("/reports", require("../routes/client/report.route"));
  const auth = require("../middlewares/auth.middleware");
  app.use("/admin/reports", auth.requireAuth, auth.requireAdmin, require("../routes/admin/report.route"));
  const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = "http://127.0.0.1:" + server.address().port;
  assert.equal((await fetch(url + "/reports", { headers: { Accept: "application/json" } })).status, 401);
  assert.equal((await fetch(url + "/admin/reports", { headers: { Accept: "application/json", "x-user": member } })).status, 403);
});
test("Index unique báo cáo mở và validation schema đúng", async () => {
  assert.ok(Report.schema.indexes().some(([key, options]) => key.openKey === 1 && options.unique && options.sparse));
  const value = new Report({ reporterId: member, targetType: "post", targetId: pid, scope: "group", reason: "spam" });
  await value.validate();
  value.status = "invalid"; await assert.rejects(value.validate());
});
