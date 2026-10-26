const mongoose = require("mongoose");
const Question = require("../../models/question.model");
const Subject = require("../../models/subject.model");
const Topic = require("../../models/topic.model");
const Latex = require("../../models/latex.model");
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

module.exports.form = async (req, res, next) => {
  try {
    let question = null;
    if (req.params.id) {
      if (!mongoose.isObjectIdOrHexString(req.params.id)) {
        return res.status(400).send("ID câu hỏi không hợp lệ.");
      }
      question = await Question.findOne({ _id: req.params.id, scope: "system" }).lean();
      if (!question) return res.status(404).send("Không tìm thấy câu hỏi.");
    }
    const [subjects, topics , formulas] = await Promise.all([
      Subject.find().select("name code active").sort({ name: 1 }).lean(),
      Topic.find().select("name code subjectId active").sort({ name: 1 }).lean(), 
      Latex.find().lean()
    ]); 
    
    res.render("admin/question-form", {
      title: question ? "Chỉnh sửa câu hỏi" : "Soạn câu hỏi mới",
      activePage: "questions", subjects, topics, question,formulas
    });
  } catch (error) { next(error); }
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
        message: "ID môn học hoặc chuyên đề không hợp lệ!",
      });
    }

    const subject = await Subject.exists({ _id: subjectId });
    if (!subject) {
      return res.status(400).json({
        code: "error",
        message: "Môn học không tồn tại!",
      });
    }

    const topic = await Topic.exists({ _id: topicId, subjectId });
    if (!topic) {
      return res.status(400).json({
        code: "error",
        message: "Chuyên đề không tồn tại hoặc không thuộc môn học!",
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

    if (!mongoose.isObjectIdOrHexString(req.params.id)) {
      return res.status(400).json({
        code: "error",
        message: "ID câu hỏi không hợp lệ!",
      });
    }

    const question = await Question.findOne({
      _id: req.params.id,
      scope: "system",
    });

    if (!question) {
      return res.status(404).json({
        code: "error",
        message: "Không tìm thấy câu hỏi!",
      });
    }

    if (
      !mongoose.isObjectIdOrHexString(subjectId) ||
      !mongoose.isObjectIdOrHexString(topicId)
    ) {
      return res.status(400).json({
        code: "error",
        message: "ID môn học hoặc chuyên đề không hợp lệ!",
      });
    }

    const subject = await Subject.exists({ _id: subjectId });
    if (!subject) {
      return res.status(400).json({
        code: "error",
        message: "Môn học không tồn tại!",
      });
    }

    const topic = await Topic.exists({ _id: topicId, subjectId });
    if (!topic) {
      return res.status(400).json({
        code: "error",
        message: "Chuyên đề không tồn tại hoặc không thuộc môn học!",
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

module.exports.delete = async (req, res, next) => {
  try {
    await Question.deleteOne({ _id: req.params.id });
    res.json({ code: "success", message: "Xóa câu hỏi thành công!" });
  } catch (error) {
    res.json({ code: "error", message: "Xóa câu hỏi thất bại!" });
  }
}