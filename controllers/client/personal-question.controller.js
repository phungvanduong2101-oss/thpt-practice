const mongoose = require("mongoose");
const Question = require("../../models/question.model");
const Subject = require("../../models/subject.model");
const Topic = require("../../models/topic.model");
const Group = require("../../models/group.model");
const Exam = require("../../models/exam.model");

// Áp dụng cho mọi route câu hỏi của nhóm, kể cả API sửa/xóa.
module.exports.index = async (req, res, next) => {
  try {
    const keyword = typeof req.query.keyword === "string"
      ? req.query.keyword.trim()
      : "";

    const subjectId = mongoose.isObjectIdOrHexString(req.query.subjectId)
      ? req.query.subjectId
      : "all";

    const topicId = mongoose.isObjectIdOrHexString(req.query.topicId)
      ? req.query.topicId
      : "all";

    const type = ["mcq", "truefalse", "fill"].includes(req.query.type)
      ? req.query.type
      : "all";

    const bloomLevel = ["1", "2", "3", "4", "5", "6"].includes(
      req.query.bloomLevel
    )
      ? req.query.bloomLevel
      : "all";

    // Chỉ quản lý câu hỏi hệ thống
    const baseFilter = { createdBy: req.account._id, scope: 'personal' };
    const filter = { ...baseFilter };

    if (keyword) {
      const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      filter.contentText = {
        $regex: escaped,
        $options: "i",
      };
    }

    if (subjectId !== "all") {
      filter.subjectId = subjectId;
    }

    if (topicId !== "all") {
      filter.topicId = topicId;
    }

    if (type !== "all") {
      filter.type = type;
    }

    if (bloomLevel !== "all") {
      filter.bloomLevel = Number(bloomLevel);
    }

    const limit = 6;
    const requestedPage = Number(req.query.page);

    let currentPage =
      Number.isSafeInteger(requestedPage) && requestedPage > 0
        ? requestedPage
        : 1;

    const [
      totalItems,
      totalQuestions,
      publishedQuestions,
      questionTopicIds,
      subjects,
      topics,
    ] = await Promise.all([
      Question.countDocuments(filter),

      Question.countDocuments(baseFilter),

      Question.countDocuments({
        ...baseFilter,
        published: true,
      }),

      Question.distinct("topicId", baseFilter),

      Subject.find({})
        .select("name code active")
        .sort({ name: 1 })
        .lean(),

      Topic.find({})
        .select("name code subjectId active")
        .sort({ name: 1 })
        .lean(),
    ]);

    const totalPages = Math.max(1, Math.ceil(totalItems / limit));
    currentPage = Math.min(currentPage, totalPages);

    const skip = (currentPage - 1) * limit;

    const questions = await Question.find(filter)
      .populate("subjectId", "name code")
      .populate("topicId", "name code")
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Chuyên đề hiển thị trong bộ lọc theo môn đang chọn
    const filteredTopics = subjectId === "all"
      ? topics
      : topics.filter(topic => String(topic.subjectId) === subjectId);

    const existingTopicIds = new Set(
      topics.map(topic => String(topic._id))
    );

    const topicsWithQuestions = questionTopicIds.filter(id =>
      existingTopicIds.has(String(id))
    ).length;

    const pageUrl = page => {
      const params = new URLSearchParams({
        keyword,
        subjectId,
        topicId,
        type,
        bloomLevel,
        page: String(page),
      });

      return `/my/questions?${params.toString()}`;
    };

    res.render("client/personal-questions", {
      title: "Ngân hàng câu hỏi",
      activePage: "my",

      questions,
      subjects,
      topics,
      filteredTopics,

      keyword,
      subjectId,
      topicId,
      type,
      bloomLevel,

      totalQuestions,
      publishedQuestions,
      topicsWithQuestions,

      totalItems,
      currentPage,
      totalPages,
      startItem: totalItems ? skip + 1 : 0,
      endItem: skip + questions.length,
      pageUrl,
    });
  } catch (error) {
    next(error);
  }
};

async function saveQuestion(req, res, next, editing) {
  try {
    const {
      topicId, type, bloomLevel,
      content, contentText, options, correctAnswer,
      acceptedAnswers, explanation, published ,subjectId,
    } = req.body || {};

    if (typeof topicId !== "string" || !topicId) return res.status(400).json({ code: "error", message: "Vui lòng chọn chuyên đề." });
    const topic = await Topic.findOne({ _id: topicId, subjectId, active: true }).lean();
    const subject = await Subject.findOne({ _id: subjectId, active: true }).lean();
    if (!subject || !topic) return res.status(400).json({ code: "error", message: "Môn hoặc chuyên đề không hợp lệ/đã ngừng hoạt động." });
    if (![1, 2, 3, 4, 5, 6].includes(Number(bloomLevel))) return res.status(400).json({ code: "error", message: "Mức Bloom phải từ 1 đến 6." });
    if (typeof published !== "boolean") return res.status(400).json({ code: "error", message: "Trạng thái câu hỏi không hợp lệ." });

    // Kiểm tra chữ hoặc công thức trong Quill Delta
    function hasContent(value) {
      const ops = Array.isArray(value?.delta)
        ? value.delta
        : value?.delta?.ops;

      if (!Array.isArray(ops)) return false;

      return ops.some(op => {
        if (typeof op.insert === "string") {
          return op.insert.trim().length > 0;
        }

        return (
          typeof op.insert?.formula === "string" &&
          op.insert.formula.trim().length > 0
        );
      });
    }

    function reject(message) {
      return res.status(400).json({
        code: "error",
        message,
      });
    }

    if (!hasContent(content)) {
      return reject("Vui lòng nhập nội dung câu hỏi!");
    }

    if (type === "mcq" || type === "truefalse") {
      if (!Array.isArray(options) || options.length !== 4) {
        return reject("Cần nhập đủ 4 phương án!");
      }

      const keys = options.map(option => option?.key);

      if (
        new Set(keys).size !== 4 ||
        !keys.every(key => ["A", "B", "C", "D"].includes(key))
      ) {
        return reject("Các phương án phải có key A, B, C, D không trùng!");
      }

      if (!options.every(option => hasContent(option.content))) {
        return reject("Vui lòng nhập nội dung cho cả 4 phương án!");
      }

      if (type === "mcq" && !keys.includes(correctAnswer)) {
        return reject("Vui lòng chọn một đáp án đúng!");
      }

      if (
        type === "truefalse" &&
        !options.every(option => typeof option.isCorrect === "boolean")
      ) {
        return reject("Mỗi mệnh đề phải có đáp án Đúng hoặc Sai!");
      }
    } else if (type === "fill") {
      if (
        !Array.isArray(acceptedAnswers) ||
        acceptedAnswers.length === 0 ||
        !acceptedAnswers.every(
          answer => typeof answer === "string" && answer.trim()
        )
      ) {
        return reject("Vui lòng nhập ít nhất một đáp án hợp lệ!");
      }
    } else {
      return reject("Loại câu hỏi không hợp lệ!");
    }

    const changes = {
      subjectId,
      topicId,
      type,
      bloomLevel,
      content,
      contentText,
      options: type === "fill" ? [] : options,
      correctAnswer: type === "mcq" ? correctAnswer : "",
      acceptedAnswers: type === "fill"
        ? acceptedAnswers.map(answer => answer.trim())
        : [],
      explanation,
      published,
      createdBy: req.account._id, scope: 'personal',
    };

    let message = "Tạo câu hỏi thành công!";
    let statusCode = 201;
    if (editing) {
      const question = await Question.findOneAndUpdate(
        { _id: req.params.questionId, createdBy: req.account._id, scope: 'personal' },
        { $set: changes },
        { new: true, runValidators: true }
      );
      if (!question) return res.status(404).json({ code: "error", message: "Không tìm thấy câu hỏi của bạn." });
      message = "Cập nhật câu hỏi thành công!";
      statusCode = 200;
    } else {
      await Question.create({ ...changes, createdBy: req.account._id });
    }

    return res.status(statusCode).json({
      code: "success",
      message,
    });
  } catch (error) {
    if (error.name === "CastError" || error.name === "ValidationError") {
      return res.status(400).json({ code: "error", message: "Dữ liệu câu hỏi không hợp lệ." });
    }
    return next(error);
  }
}

module.exports.create = (req, res, next) => saveQuestion(req, res, next, false);
module.exports.update = (req, res, next) => saveQuestion(req, res, next, true);

module.exports.remove = async (req, res, next) => {
  try {
    const filter = { _id: req.params.questionId , createdBy: req.account._id, scope: 'personal' };
    const question = await Question.findOne(filter).select("_id").lean();
    if (!question) return res.status(404).json({ code: "error", message: "Không tìm thấy câu hỏi của bạn." });
    const used = await Exam.exists({ questionIds: question._id });
    if (used) return res.status(409).json({ code: "error", message: "Câu hỏi đã thuộc đề thi, chỉ được sửa." });
    const result = await Question.deleteOne(filter);
    if (!result.deletedCount) return res.status(404).json({ code: "error", message: "Câu hỏi không còn tồn tại." });
    return res.json({ code: "success", message: "Đã xóa câu hỏi." });
  } catch (error) {
    if (error.name === "CastError") return res.status(400).json({ code: "error", message: "ID không hợp lệ." });
    return next(error);
  }
};
