const mongoose = require("mongoose");
const Question = require("../../models/question.model");
const Subject = require("../../models/subject.model");
const Topic = require("../../models/topic.model");

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

    // Chỉ quản lý câu hỏi hệ thống.
    const baseFilter = { scope: "system" };
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

    const questions = await Question.find(filter)
      .populate("subjectId", "name code")
      .populate("topicId", "name code")
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

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

      return `/admin/questions?${params.toString()}`;
    };

    res.render("admin/questions", {
      title: "Ngân hàng câu hỏi",
      activePage: "questions",

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

module.exports.create = async (req, res, next) => {
  try {
    const {
      subjectId,
      topicId,
      type,
      bloomLevel,
      content,
      contentText,
      options,
      correctAnswer,
      acceptedAnswers,
      explanation,
      published,
    } = req.body;

    // Kiểm tra chữ hoặc công thức trong Quill Delta.
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

    await Question.create({
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
      createdBy: req.account._id,
      scope: "system",
    });

    return res.status(201).json({
      code: "success",
      message: "Tạo câu hỏi thành công!",
    });
  } catch (error) {
    next(error);
  }
};