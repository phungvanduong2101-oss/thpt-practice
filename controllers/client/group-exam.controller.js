const mongoose = require("mongoose");
const Exam = require("../../models/exam.model");
const Subject = require("../../models/subject.model");
const Topic = require("../../models/topic.model");
const Question = require("../../models/question.model");
const Group = require("../../models/group.model");

module.exports.requireOwner = async (req, res, next) => {
  try {
    const group = await Group.findById(req.params.id).lean();
    if (!group) return res.status(404).json({ code: "error", message: "Không tìm thấy nhóm." });
    if (String(group.ownerId) !== String(req.account._id)) {
      return res.status(403).json({ code: "error", message: "Chỉ trưởng nhóm được quản lý đề thi." });
    }
    req.group = group;
    return next();
  } catch (error) {
    if (error.name === "CastError") return res.status(400).json({ code: "error", message: "ID nhóm không hợp lệ." });
    return next(error);
  }
};

module.exports.index = async (req, res, next) => {
  try {
    const keyword = typeof req.query.keyword === "string"
      ? req.query.keyword.trim()
      : "";

    const subjectId =
      typeof req.query.subjectId === "string" &&
      mongoose.isObjectIdOrHexString(req.query.subjectId)
        ? req.query.subjectId
        : "all";

    const status = ["draft", "published"].includes(req.query.status)
      ? req.query.status
      : "all";

    const baseFilter = { groupId: req.group._id };
    const filter = { ...baseFilter };

    if (keyword) {
      const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      filter.$or = [
        { title: { $regex: escaped, $options: "i" } },
        { description: { $regex: escaped, $options: "i" } },
      ];
    }

    if (subjectId !== "all") {
      filter.subjectId = subjectId;
    }

    if (status !== "all") {
      filter.status = status;
    }

    const limit = 5;
    const requestedPage = Number(req.query.page);

    let currentPage =
      Number.isSafeInteger(requestedPage) && requestedPage > 0
        ? requestedPage
        : 1;

    const [
      totalItems,
      totalExams,
      publishedExams,
      pickedStats,
      subjects,
      topics,
    ] = await Promise.all([
      Exam.countDocuments(filter),

      Exam.countDocuments(baseFilter),

      Exam.countDocuments({
        ...baseFilter,
        status: "published",
      }),

      Exam.aggregate([
        { $match: baseFilter },
        {
          $group: {
            _id: null,
            total: {
              $sum: {
                $size: { $ifNull: ["$questionIds", []] },
              },
            },
          },
        },
      ]),

      Subject.find()
        .select("name code active")
        .sort({ name: 1 })
        .lean(),

      Topic.find()
        .select("name code subjectId active")
        .sort({ name: 1 })
        .lean(),

    ]);

    const totalPages = Math.max(1, Math.ceil(totalItems / limit));
    currentPage = Math.min(currentPage, totalPages);

    const skip = (currentPage - 1) * limit;

    const exams = await Exam.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const selectedQuestionIds = exams.flatMap(exam => exam.questionIds || []);
    const questions = await Question.find({
      _id: { $in: selectedQuestionIds },
      $or: [{ groupId: null }, { groupId: req.group._id }],
    }).lean();

    const pageUrl = page => {
      const params = new URLSearchParams({
        keyword,
        subjectId,
        status,
        page: String(page),
      });

      return `/groups/${req.group._id}/exams/manage?${params.toString()}`;
    };

    res.render("client/group-exams-manage", {
      group: req.group,
      title: "Quản lý đề thi",
      activePage: "groups",

      subjects,
      topics,
      questions,
      exams,

      keyword,
      subjectId,
      status,

      totalExams,
      publishedExams,
      totalPicked: pickedStats[0]?.total || 0,

      totalItems,
      currentPage,
      totalPages,
      startItem: totalItems ? skip + 1 : 0,
      endItem: skip + exams.length,
      pageUrl,
    });
  } catch (error) {
    next(error);
  }
}; 


async function saveExam(req, res, next, editing) {
  try {
    const body = req.body || {};
    const { subjectId, questionIds, status } = body;
    let title = "";
    let description = "";
    if (typeof body.title === "string") title = body.title.trim();
    if (typeof body.description === "string") description = body.description.trim();
    const duration = Number(body.duration);
    const reject = message => res.status(400).json({ code: "error", message });

    if (title.length < 5 || title.length > 120) return reject("Tên đề phải có từ 5 đến 120 ký tự.");
    if (description.length > 500) return reject("Mô tả tối đa 500 ký tự.");
    if (!Number.isInteger(duration) || duration < 1 || duration > 300) return reject("Thời gian phải là số nguyên từ 1 đến 300 phút.");
    if (!["draft", "published"].includes(status)) return reject("Trạng thái đề không hợp lệ.");
    if (typeof subjectId !== "string" || !subjectId) return reject("Vui lòng chọn môn học.");
    const subject = await Subject.findOne({ _id: subjectId, active: true }).lean();
    if (!subject) return reject("Môn học không tồn tại hoặc đã ngừng hoạt động.");
    if (!Array.isArray(questionIds) || !questionIds.length) return reject("Đề thi phải có ít nhất một câu hỏi.");
    if (!questionIds.every(id => typeof id === "string" && id)) return reject("Danh sách câu hỏi không hợp lệ.");
    const uniqueIds = new Set(questionIds.map(id => id.toLowerCase()));
    if (uniqueIds.size !== questionIds.length) return reject("Không được chọn trùng câu hỏi.");

    // Không tin groupId, môn học hoặc trạng thái câu hỏi do client gửi.
    const questions = await Question.find({
      _id: { $in: questionIds },
      $or: [{ groupId: null }, { groupId: req.group._id }],
      subjectId: subject._id,
      published: true,
    }).select("_id").lean();
    if (questions.length !== questionIds.length) {
      return reject("Có câu hỏi không thuộc hệ thống/nhóm này, sai môn, chưa xuất bản hoặc đã bị xóa.");
    }

    const changes = { title, subjectId: subject._id, duration, description, status, questionIds, groupId: req.group._id };
    if (editing) {
      const exam = await Exam.findOneAndUpdate(
        { _id: req.params.examId, groupId: req.group._id },
        { $set: changes },
        { new: true, runValidators: true }
      );
      if (!exam) return res.status(404).json({ code: "error", message: "Không tìm thấy đề trong nhóm." });
      return res.json({ code: "success", message: "Cập nhật đề thi thành công!", examId: exam._id });
    }
    const exam = await Exam.create({ ...changes, createdBy: req.account._id });
    return res.status(201).json({ code: "success", message: "Tạo đề thi thành công!", examId: exam._id });
  } catch (error) {
    if (error.name === "CastError" || error.name === "ValidationError") {
      return res.status(400).json({ code: "error", message: "Dữ liệu đề thi hoặc ID không hợp lệ." });
    }
    return next(error);
  }
}

module.exports.create = (req, res, next) => saveExam(req, res, next, false);
module.exports.update = (req, res, next) => saveExam(req, res, next, true);
module.exports.remove = async (req, res, next) => {
  try {
    const exam = await Exam.findOneAndDelete({ _id: req.params.examId, groupId: req.group._id });
    if (!exam) return res.status(404).json({ code: "error", message: "Không tìm thấy đề trong nhóm." });
    // Giữ nguyên Attempt và snapshot của các bài đã làm.
    return res.json({ code: "success", message: "Đã xóa đề thi." });
  } catch (error) {
    if (error.name === "CastError") return res.status(400).json({ code: "error", message: "ID đề không hợp lệ." });
    return next(error);
  }
};

// Lọc và phân trang câu hỏi tại MongoDB, không tải toàn bộ ngân hàng về client.
module.exports.questions = async (req, res, next) => {
  try {
    const { subjectId } = req.query;
    if (typeof subjectId !== "string" || !subjectId) {
      return res.status(400).json({ code: "error", message: "Vui lòng chọn môn học." });
    }
    const subject = await Subject.findOne({ _id: subjectId, active: true }).lean();
    if (!subject) return res.status(400).json({ code: "error", message: "Môn học không khả dụng." });

    const filter = {
      subjectId: subject._id,
      published: true,
      $or: [{ groupId: null }, { groupId: req.group._id }],
    };
    const source = req.query.source;
    if (source === "system") {
      delete filter.$or;
      filter.groupId = null;
    } else if (source === "group") {
      delete filter.$or;
      filter.groupId = req.group._id;
    } else if (source !== undefined && source !== "all") {
      return res.status(400).json({ code: "error", message: "Nguồn câu hỏi không hợp lệ." });
    }
    if (typeof req.query.topicId === "string" && req.query.topicId !== "all" && req.query.topicId) {
      filter.topicId = req.query.topicId;
    }
    if (["mcq", "truefalse", "fill"].includes(req.query.type)) filter.type = req.query.type;
    if (["1", "2", "3", "4", "5", "6"].includes(req.query.bloomLevel)) filter.bloomLevel = Number(req.query.bloomLevel);
    if (typeof req.query.keyword === "string" && req.query.keyword.trim()) {
      const escaped = req.query.keyword.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.contentText = { $regex: escaped, $options: "i" };
    }
    const limit = 8;
    let currentPage = Number(req.query.page);
    if (!Number.isSafeInteger(currentPage) || currentPage < 1) currentPage = 1;
    const totalItems = await Question.countDocuments(filter);
    const totalPages = Math.max(1, Math.ceil(totalItems / limit));
    currentPage = Math.min(currentPage, totalPages);
    const questions = await Question.find(filter)
      .select("subjectId topicId type bloomLevel content contentText options correctAnswer acceptedAnswers explanation published groupId")
      .sort({ createdAt: -1, _id: -1 })
      .skip((currentPage - 1) * limit)
      .limit(limit)
      .lean();
    return res.json({ code: "success", questions, totalItems, currentPage, totalPages });
  } catch (error) {
    if (error.name === "CastError") return res.status(400).json({ code: "error", message: "ID không hợp lệ." });
    return next(error);
  }
};
