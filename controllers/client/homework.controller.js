const { Assignment, Work } = require("../../models/homework.model");
const Account = require("../../models/account.model");
const notifications = require("../../services/notification.service");
const Exam = require("../../models/exam.model");
const taking = require("./group-exam-taking.controller");
const { shuffle, finish } = require("../../services/homework");
const includes = (ids, id) => ids.some((item) => String(item) === String(id));
const fail = (res, code, message) => res.status(code).send(message);
function success(req, res, message, redirectUrl) {
  if (req.get("Accept")?.includes("application/json"))
    return res.json({ message, redirectUrl });
  return res.redirect(redirectUrl);
}
const open = (a) => a.due.getTime() > Date.now();
const fmt = (d) =>
  d
    ? new Date(d).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })
    : "—";
const date = (raw) =>
  /^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(raw)
    ? new Date(raw + ":00+07:00")
    : new Date(NaN);
exports.context = (req, res, next) => {
  Object.assign(res.locals, {
    owner: String(req.group.ownerId) === String(req.account._id),
    base: "/groups/" + req.group._id + "/homework",
    fmt,
    title: "Bài tập về nhà",
  });
  res.set("Cache-Control", "private, no-store");
  next();
};
exports.owner = (req, res, next) =>
  res.locals.owner ? next() : fail(res, 403, "Chỉ chủ nhóm được quản lý.");
const members = (req) =>
  Account.find({ _id: { $in: req.group.memberIds, $ne: req.group.ownerId } })
    .select("fullName")
    .lean();
function selection(req) {
  const raw = req.body.students || [];
  const ids = [...new Set(Array.isArray(raw) ? raw : [raw])];
  return ids.every(
    (id) =>
      includes(req.group.memberIds, id) && String(req.group.ownerId) !== id,
  )
    ? ids
    : null;
}
exports.list = async (req, res) => {
  const owner = res.locals.owner;
  const filter = { groupId: req.group._id };
  if (!owner) filter.recipients = req.account._id;
  const pageSize = 10;
  const totalItems = await Assignment.countDocuments(filter);
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const requestedPage = Number(req.query.page);
  const currentPage = Math.min(totalPages, Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1);
  const assignments = await Assignment.find(filter)
    .select("title due")
    .sort({ createdAt: -1, _id: -1 })
    .skip((currentPage - 1) * pageSize)
    .limit(pageSize)
    .lean();
  if (!owner) {
    const works = await Work.find({
      assignmentId: { $in: assignments.map(item => item._id) },
      accountId: req.account._id
    }).select("assignmentId status").lean();
    const states = new Map(works.map(work => [String(work.assignmentId), work.status]));
    assignments.forEach(item => {
      item.workStatus = states.get(String(item._id));
      item.available = open(item) && item.workStatus !== "submitted";
    });
  }
  const exams = owner
    ? await Exam.find({
        createdBy: req.account._id,
        scope: "personal",
        status: "published",
      })
        .select("title")
        .lean()
    : [];
  res.render("client/homework", {
    assignments,
    totalItems, totalPages, currentPage,
    startItem: totalItems ? (currentPage - 1) * pageSize + 1 : 0,
    endItem: (currentPage - 1) * pageSize + assignments.length,
    pageUrl: page => res.locals.base + "?page=" + page,
    exams,
    people: owner ? await members(req) : [],
  });
};
exports.create = async (req, res) => {
  const ids = selection(req),
    due = date(req.body.due),
    title = String(req.body.title || "").trim();
  if (!ids?.length || !(due > new Date()) || !title)
    return fail(res, 400, "Kiểm tra tên, người nhận và hạn nộp.");
  if (typeof req.body.examId !== "string" || !/^[a-f0-9]{24}$/i.test(req.body.examId))
    return fail(res, 400, "Đề không hợp lệ.");
  req.params.examId = req.body.examId;
  const data = await taking.loadExam(req, { createdBy: req.account._id });
  if (!data || data.invalid) return fail(res, 400, "Đề không khả dụng.");
  const a = await Assignment.create({
    groupId: req.group._id,
    title,
    due,
    recipients: ids,
    examId: data.exam._id,
    subjectId: data.exam.subjectId._id,
    questions: data.questions.map((q) => ({ ...q, questionId: q._id })),
  });
  await notifyRecipients(req, a, ids);
  success(req, res, "Giao bài tập thành công!", res.locals.base + "/" + a._id);
};
exports.load = async (req, res, next) => {
  const a = await Assignment.findOne({
    _id: req.params.aid,
    groupId: req.group._id,
  }).lean();
  if (!a || (!res.locals.owner && !includes(a.recipients, req.account._id)))
    return fail(res, 404, "Bài tập không khả dụng.");
  req.assignment = a;
  res.locals.url = res.locals.base + "/" + a._id;
  next();
};
exports.recipients = async (req, res) => {
  const ids = selection(req),
    a = req.assignment;
  if (!ids) return fail(res, 400, "Người nhận không hợp lệ.");
  const revoked = [
    ...new Set([...a.revoked, ...a.recipients].map(String)),
  ].filter((id) => !ids.includes(id));
  const result = await Assignment.updateOne(
    { _id: a._id, __v: Number(req.body.version), due: { $gt: new Date() } },
    { $set: { recipients: ids, revoked }, $inc: { __v: 1 } },
  );
  if (!result.modifiedCount)
    return fail(res, 409, "Bài đã thay đổi hoặc hết hạn.");
  await notifyRecipients(req, a, ids.filter(id => !includes(a.recipients, id)));
  success(req, res, "Cập nhật người nhận thành công!", res.locals.url);
};
exports.extend = async (req, res) => {
  const due = date(req.body.due);
  if (!(due > req.assignment.due))
    return fail(res, 400, "Hạn mới phải muộn hơn.");
  const r = await Assignment.updateOne(
    { _id: req.assignment._id, due: { $gt: new Date(), $lt: due } },
    { $set: { due }, $inc: { __v: 1 } },
  );
  if (!r.modifiedCount) return fail(res, 409, "Không thể gia hạn.");
  success(req, res, "Gia hạn bài tập thành công!", res.locals.url);
};
const mine = (req) => ({
  assignmentId: req.assignment._id,
  accountId: req.account._id,
});
exports.start = async (req, res) => {
  const a = req.assignment;
  if (!includes(a.recipients, req.account._id) || !open(a))
    return fail(res, 403, "Không thể bắt đầu.");
  try {
    await Work.updateOne(
      mine(req),
      {
        $setOnInsert: {
          ...mine(req),
          groupId: a.groupId,
          examId: a.examId,
          subjectId: a.subjectId,
          examTitle: a.title,
          duration: 1,
          questions: shuffle(a.questions),
          totalQuestions: a.questions.length,
          maxScore: a.maxScore,
          status: "in_progress",
          __v: 0,
        },
      },
      { upsert: true },
    );
  } catch (e) {
    if (e.code !== 11000) throw e;
  }
  notifyOwner(req);
  success(req, res, "Mở bài làm thành công!", res.locals.url + "/work");
};
exports.status = (req, res) =>
  res.json({ due: req.assignment.due, now: Date.now() });
exports.work = async (req, res) => {
  const w = await Work.findOne(mine(req)).lean();
  if (!w || !open(req.assignment) || w.status !== "in_progress")
    return res.redirect(res.locals.url);
  res.render("client/homework-work", { w, due: req.assignment.due });
};
function clean(questions, raw) {
  const draft = {};
  for (const q of questions) {
    const key = String(q.questionId),
      v = raw[key];
    if (q.type === "truefalse" && v && typeof v === "object") {
      const pairs = q.options
        .filter((o) => typeof v[o.key] === "boolean")
        .map((o) => [o.key, v[o.key]]);
      if (pairs.length) draft[key] = Object.fromEntries(pairs);
    } else if (
      typeof v === "string" &&
      v.trim() &&
      (q.type === "fill" ||
        (q.type === "mcq" && q.options.some((o) => o.key === v)))
    )
      draft[key] = v.trim();
  }
  return draft;
}
exports.write = async (req, res) => {
  const w = await Work.findOne(mine(req)).lean();
  if (
    !w ||
    !open(req.assignment) ||
    !includes(req.assignment.recipients, req.account._id)
  )
    return fail(res, 403, "Đã hết hạn hoặc bị thu hồi.");
  if (
    !req.body.answers ||
    typeof req.body.answers !== "object" ||
    !Number.isInteger(req.body.version)
  )
    return fail(res, 400, "Dữ liệu không hợp lệ.");
  const draft = clean(w.questions, req.body.answers);
  const changes = req.path.endsWith("/submit")
    ? finish(w, draft, false)
    : { draft };
  const r = await Work.updateOne(
    { _id: w._id, status: "in_progress", __v: req.body.version },
    { $set: { ...changes, savedAt: new Date() }, $inc: { __v: 1 } },
  );
  if (!r.modifiedCount)
    return fail(res, 409, "Bài đã thay đổi. Hãy tải lại trước khi tiếp tục.");
  notifyOwner(req);
  res.json({ version: req.body.version + 1 });
};
function notifyOwner(req) {
  req.app.get("io")?.to("account:" + req.group.ownerId).emit("homework:progress", String(req.assignment._id));
}
exports.detail = async (req, res) => {
  const a = req.assignment,
    owner = res.locals.owner,
    visible = owner || !open(a);
  const works = await Work.find({ assignmentId: a._id })
    .select("accountId status expired savedAt submittedAt score draft")
    .lean();
  const accounts = await Account.find({
    _id: { $in: [...a.recipients, ...a.revoked] },
  })
    .select("fullName")
    .lean();
  const rows = accounts.map((p) => {
    const w = works.find((w) => String(w.accountId) === String(p._id));
    return {
      id: p._id,
      name: p.fullName,
      revoked: !includes(a.recipients, p._id),
      w,
      state: !w
        ? "Chưa làm"
        : w.status === "in_progress"
          ? "Đang làm"
          : w.expired
            ? "Chốt do hết hạn"
            : "Đã nộp",
    };
  });
  const ranked = rows
    .filter((r) => !r.revoked && r.w?.status === "submitted")
    .sort((x, y) => y.w.score - x.w.score);
  ranked.forEach(
    (r, i) =>
      (r.rank =
        i && ranked[i - 1].w.score === r.w.score ? ranked[i - 1].rank : i + 1),
  );
  const fragment = owner && req.query.view === "progress";
  res.render(fragment ? "client/partials/homework-progress" : "client/homework-detail", {
    a,
    rows,
    ranked: visible ? ranked : [],
    visible,
    available: open(a),
    myRow: rows.find((r) => String(r.id) === String(req.account._id)),
    people: owner && !fragment ? await members(req) : [],
  });
};
exports.result = async (req, res) => {
  if (
    !res.locals.owner &&
    (open(req.assignment) || String(req.account._id) !== req.params.student)
  )
    return fail(res, 403, "Chưa được xem kết quả.");
  const attempt = await Work.findOne({
    assignmentId: req.assignment._id,
    accountId: req.params.student,
    status: "submitted",
  }).lean();
  if (!attempt) return fail(res, 404, "Chưa có kết quả.");
  const student = await Account.findById(attempt.accountId).select("fullName").lean();
  res.render("client/exam-result", {
    attempt, homeworkResult: true,
    studentName: student ? student.fullName : "Học sinh",
    listUrl: res.locals.url, retryUrl: null,
  });
};

async function notifyRecipients(req, assignment, recipientIds) {
  const results = await Promise.allSettled(recipientIds.map(recipientId => notifications.send(req.app.get("io"), {
    recipientId, senderId: req.account._id, type: "homework_assigned",
    content: ("Nhóm " + req.group.name + " giao bài tập: " + assignment.title + ". Hạn nộp " + fmt(assignment.due)).slice(0,500),
    link: "/groups/" + req.group._id + "/homework/" + assignment._id
  })));
  results.forEach(result => { if (result.status === "rejected") console.error("Không gửi được thông báo giao bài:", result.reason); });
}
