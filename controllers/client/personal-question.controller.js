const mongoose = require("mongoose");
const Latex = require("../../models/latex.model");
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

    if (
      !mongoose.isObjectIdOrHexString(subjectId) ||
      !mongoose.isObjectIdOrHexString(topicId)
    ) {
      return res.status(400).json({
        code: "error",
        message: "ID môn học hoặc chuyên đề không hợp lệ.",
      });
    }

    const subject = await Subject.exists({
      _id: subjectId,
      active: true,
    });

    const topic = await Topic.exists({
      _id: topicId,
      subjectId,
      active: true,
    });

    if (!subject || !topic) {
      return res.status(400).json({
        code: "error",
        message: "Môn hoặc chuyên đề không tồn tại/đã ngừng hoạt động.",
      });
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
      acceptedAnswers: type === "fill" ? acceptedAnswers : [],
      explanation,
      published,
      createdBy: req.account._id,
      scope: "personal",
    });

    return res.status(201).json({
      code: "success",
      message: "Tạo câu hỏi thành công!",
    });
  } catch (error) {
    next(error);
  }
};

module.exports.update = async (req, res, next) => {
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

    if (!mongoose.isObjectIdOrHexString(req.params.questionId)) {
      return res.status(400).json({
        code: "error",
        message: "ID câu hỏi không hợp lệ.",
      });
    }

    const question = await Question.findOne({
      _id: req.params.questionId,
      createdBy: req.account._id,
      scope: "personal",
    });

    if (!question) {
      return res.status(404).json({
        code: "error",
        message: "Không tìm thấy câu hỏi của bạn.",
      });
    }

    if (
      !mongoose.isObjectIdOrHexString(subjectId) ||
      !mongoose.isObjectIdOrHexString(topicId)
    ) {
      return res.status(400).json({
        code: "error",
        message: "ID môn học hoặc chuyên đề không hợp lệ.",
      });
    }

    const subject = await Subject.exists({
      _id: subjectId,
      active: true,
    });

    const topic = await Topic.exists({
      _id: topicId,
      subjectId,
      active: true,
    });

    if (!subject || !topic) {
      return res.status(400).json({
        code: "error",
        message: "Môn hoặc chuyên đề không tồn tại/đã ngừng hoạt động.",
      });
    }

    question.set({
      subjectId,
      topicId,
      type,
      bloomLevel,
      content,
      contentText,
      options: type === "fill" ? [] : options,
      correctAnswer: type === "mcq" ? correctAnswer : "",
      acceptedAnswers: type === "fill" ? acceptedAnswers : [],
      explanation,
      published,
    });

    await question.save();

    return res.status(200).json({
      code: "success",
      message: "Cập nhật câu hỏi thành công!",
    });
  } catch (error) {
    next(error);
  }
};
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

module.exports.form = async (req, res, next) => {
  try {
    let question = null;
    const id = req.params.questionId;
    if (id) {
      if (!mongoose.isObjectIdOrHexString(id)) return res.status(400).send("ID câu hỏi không hợp lệ.");
      question = await Question.findOne({ _id: id, createdBy: req.account._id, scope: "personal" }).lean();
      if (!question) return res.status(404).send("Không tìm thấy câu hỏi.");
    }
    const [subjects, topics, formulas] = await Promise.all([
      Subject.find().select("name code active").sort({ name: 1 }).lean(),
      Topic.find().select("name code subjectId active").sort({ name: 1 }).lean(),
      Latex.find().select("name code").sort({ name: 1 }).lean(),
    ]);
    res.render("client/personal-question-form", {
      title: question ? "Chỉnh sửa câu hỏi" : "Soạn câu hỏi mới",
      activePage: "my", subjects, topics, question, formulas,
    });
  } catch (error) { next(error); }
};
