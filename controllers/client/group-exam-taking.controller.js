const { createHash } = require("crypto");
const Group = require("../../models/group.model");
const Exam = require("../../models/exam.model");
const Question = require("../../models/question.model");
const Subject = require("../../models/subject.model");
const Attempt = require("../../models/attempt.model");

function fail(res, status, message) {
  return res.status(status).json({ code: "error", message });
}

module.exports.requireMember = async (req, res, next) => {
  try {
    const group = await Group.findById(req.params.id).lean();
    if (!group) return fail(res, 404, "Không tìm thấy nhóm.");
    const accountId = String(req.account._id);
    const isOwner = String(group.ownerId) === accountId;
    const isMember = group.memberIds.some(id => String(id) === accountId);
    if (!isOwner && !isMember) return fail(res, 403, "Bạn chưa là thành viên của nhóm.");
    if (group.status !== "active") return fail(res, 403, "Nhóm đang ngừng hoạt động.");
    req.group = group;
    return next();
  } catch (error) {
    if (error.name === "CastError") return fail(res, 404, "Không tìm thấy nhóm.");
    return next(error);
  }
};

module.exports.index = async (req, res, next) => {
  try {
    let keyword = "";
    let subjectId = "all";
    if (typeof req.query.keyword === "string") keyword = req.query.keyword.trim();
    const subjects = await Subject.find({ active: true }).select("name").sort({ name: 1 }).lean();
    const filter = { groupIds: req.group._id, scope: 'personal', status: "published", subjectId: { $in: subjects.map(s => s._id) } };
    const selected = subjects.find(s => String(s._id) === req.query.subjectId);
    if (selected) {
      subjectId = String(selected._id);
      filter.subjectId = selected._id;
    }
    if (keyword) filter.title = { $regex: keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    const limit = 9;
    let currentPage = Number(req.query.page);
    if (!Number.isSafeInteger(currentPage) || currentPage < 1) currentPage = 1;
    const totalItems = await Exam.countDocuments(filter);
    const totalPages = Math.max(1, Math.ceil(totalItems / limit));
    currentPage = Math.min(currentPage, totalPages);
    const skip = (currentPage - 1) * limit;
    const records = await Exam.find(filter).select("title subjectId duration description questionIds").populate("subjectId", "name")
      .sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean();
    const exams = records.map(({ questionIds, ...exam }) => ({ ...exam, questionCount: questionIds.length }));
    const pageUrl = page => `/groups/${req.group._id}/exams?${new URLSearchParams({ keyword, subjectId, page: String(page) })}`;
    return res.render("client/group-exams", {
      title: "Đề thi của nhóm", activePage: "groups", group: req.group,
      exams, subjects, keyword, subjectId, totalItems, totalPages, currentPage,
      startItem: totalItems ? skip + 1 : 0, endItem: skip + exams.length, pageUrl,
    });
  } catch (error) { return next(error); }
};

async function loadExam(req) {
  const exam = await Exam.findOne({ _id: req.params.examId, groupIds: req.group._id, scope: 'personal', status: "published" })
    .populate("subjectId", "name active").lean();
  if (!exam || !exam.subjectId?.active) return null;
  const records = await Question.find({
    _id: { $in: exam.questionIds }, subjectId: exam.subjectId._id, published: true,
    $or: [
      { scope: 'system' },
      { scope: 'personal', createdBy: exam.createdBy },
    ],
  }).lean();
  const map = new Map(records.map(q => [String(q._id), q]));
  const questions = exam.questionIds.map(id => map.get(String(id)));
  if (!questions.length || questions.some(q => !q)) return { invalid: true };
  return { exam, questions };
}

// Chỉ gửi các trường hiển thị về trình duyệt.
function displayQuestions(questions) {
  return questions.map(q => ({
    _id: q._id, type: q.type, content: q.content, contentText: q.contentText,
    options: q.options.map(option => ({ key: option.key, content: option.content })),
  }));
}
function versionOf(exam, questions) {
  return createHash("sha256").update(JSON.stringify({
    title: exam.title, duration: exam.duration, subjectId: String(exam.subjectId._id),
    questions: displayQuestions(questions),
  })).digest("hex");
}

module.exports.detail = async (req, res, next) => {
  try {
    const data = await loadExam(req);
    if (!data) return fail(res, 404, "Đề thi không còn khả dụng.");
    if (data.invalid) return fail(res, 409, "Đề có câu hỏi không còn khả dụng.");
    const { exam, questions } = data;
    return res.render("client/exam-taking", {
      title: exam.title, activePage: "groups", exam, questions: displayQuestions(questions),
      startUrl: `/groups/${req.group._id}/exams/${exam._id}/start`,
      listUrl: `/groups/${req.group._id}/exams`,
      examVersion: versionOf(exam, questions),
    });
  } catch (error) {
    if (error.name === "CastError") return fail(res, 404, "Không tìm thấy đề thi.");
    return next(error);
  }
};

module.exports.start = async (req, res, next) => {
  try {
    const data = await loadExam(req);
    if (!data) return fail(res, 404, "Đề thi không còn khả dụng.");
    if (data.invalid) return fail(res, 409, "Đề có câu hỏi không còn khả dụng.");
    const { exam, questions } = data;
    if (req.body?.examVersion !== versionOf(exam, questions)) {
      return fail(res, 409, "Đề đã thay đổi. Vui lòng tải lại trang trước khi bắt đầu.");
    }
    const snapshots = questions.map(q => ({
      questionId: q._id, type: q.type, content: q.content, contentText: q.contentText,
      options: q.options, correctAnswer: q.correctAnswer,
      acceptedAnswers: q.acceptedAnswers, explanation: q.explanation,
    }));
    const attempt = await Attempt.create({
      accountId: req.account._id, examId: exam._id, groupId: req.group._id,
      subjectId: exam.subjectId._id, examTitle: exam.title, duration: exam.duration,
      status: "in_progress", questions: snapshots, totalQuestions: snapshots.length,
      maxScore: 10, startedAt: new Date(),
    });
    return res.status(201).json({ code: "success", message: "Tạo bài làm thành công. Nhấn OK để bắt đầu.", attemptId: attempt._id });
  } catch (error) {
    if (error.name === "CastError") return fail(res, 400, "ID không hợp lệ.");
    return next(error);
  }
};
