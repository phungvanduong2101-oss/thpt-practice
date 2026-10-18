const mongoose = require("mongoose");
const Exam = require("../../models/exam.model");
const Subject = require("../../models/subject.model");
const Topic = require("../../models/topic.model");
const Question = require("../../models/question.model");

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

    const baseFilter = { scope: "system" };
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
      questions,
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

      Question.find({ scope: "system" })
        .select(
          "subjectId topicId type bloomLevel content contentText " +
          "options correctAnswer acceptedAnswers explanation published scope"
        )
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

    const pageUrl = page => {
      const params = new URLSearchParams({
        keyword,
        subjectId,
        status,
        page: String(page),
      });

      return `/admin/exams?${params.toString()}`;
    };

    res.render("admin/exams", {
      title: "Quản lý đề thi",
      activePage: "exams",

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

module.exports.create = async (req, res, next) => {
  try {
    const {
      title,
      subjectId,
      duration,
      description,
      status,
      questionIds,
    } = req.body;

    if (!mongoose.isObjectIdOrHexString(subjectId)) {
      return res.status(400).json({
        code: "error",
        message: "Môn học không hợp lệ!",
      });
    }

    const subject = await Subject.findOne({
      _id: subjectId,
      active: true,
    }).lean();

    if (!subject) {
      return res.status(400).json({
        code: "error",
        message: "Môn học không tồn tại hoặc đã bị ẩn!",
      });
    }

    if (!Array.isArray(questionIds) || questionIds.length === 0) {
      return res.status(400).json({
        code: "error",
        message: "Đề thi phải có ít nhất 1 câu hỏi!",
      });
    }

    if (!questionIds.every(id => mongoose.isObjectIdOrHexString(id))) {
      return res.status(400).json({
        code: "error",
        message: "ID câu hỏi không hợp lệ!",
      });
    }

    const uniqueIds = new Set(
      questionIds.map(id => String(id).toLowerCase())
    );

    if (uniqueIds.size !== questionIds.length) {
      return res.status(400).json({
        code: "error",
        message: "Không được chọn trùng câu hỏi!",
      });
    }

    const questionCount = await Question.countDocuments({
      _id: { $in: questionIds },
      subjectId,
      scope: "system",
      published: true,
    });

    if (questionCount !== questionIds.length) {
      return res.status(400).json({
        code: "error",
        message:
          "Câu hỏi phải thuộc hệ thống, đúng môn và đã xuất bản!",
      });
    }

    await Exam.create({
      title,
      subjectId,
      duration,
      description,
      status,
      questionIds,
      createdBy: req.account._id,
      scope: "system",
    });

    return res.status(201).json({
      code: "success",
      message: "Tạo đề thi thành công!",
    });
  } catch (error) {
    if (error.name === "ValidationError" || error.name === "CastError") {
      return res.status(400).json({
        code: "error",
        message: "Dữ liệu đề thi không hợp lệ!",
      });
    }

    next(error);
  }
};

module.exports.update = async (req, res, next) => {
  try {
    const {
      title,
      subjectId,
      duration,
      description,
      status,
      questionIds,
    } = req.body;

    if (!mongoose.isObjectIdOrHexString(req.params.id)) {
      return res.status(400).json({
        code: "error",
        message: "ID đề thi không hợp lệ!",
      });
    }

    if (!mongoose.isObjectIdOrHexString(subjectId)) {
      return res.status(400).json({
        code: "error",
        message: "Môn học không hợp lệ!",
      });
    }

    const subject = await Subject.findOne({
      _id: subjectId,
      active: true,
    }).lean();

    if (!subject) {
      return res.status(400).json({
        code: "error",
        message: "Môn học không tồn tại hoặc đã bị ẩn!",
      });
    }

    if (!Array.isArray(questionIds) || questionIds.length === 0) {
      return res.status(400).json({
        code: "error",
        message: "Đề thi phải có ít nhất 1 câu hỏi!",
      });
    }

    if (!questionIds.every(id => mongoose.isObjectIdOrHexString(id))) {
      return res.status(400).json({
        code: "error",
        message: "ID câu hỏi không hợp lệ!",
      });
    }

    const uniqueIds = new Set(
      questionIds.map(id => String(id).toLowerCase())
    );

    if (uniqueIds.size !== questionIds.length) {
      return res.status(400).json({
        code: "error",
        message: "Không được chọn trùng câu hỏi!",
      });
    }

    const questionCount = await Question.countDocuments({
      _id: { $in: questionIds },
      subjectId,
      scope: "system",
      published: true,
    });

    if (questionCount !== questionIds.length) {
      return res.status(400).json({
        code: "error",
        message:
          "Câu hỏi phải thuộc hệ thống, đúng môn và đã xuất bản!",
      });
    }

    const exam = await Exam.findOneAndUpdate(
      {
        _id: req.params.id,
        scope: "system",
      },
      {
        $set: {
          title,
          subjectId,
          duration,
          description,
          status,
          questionIds,
        },
      },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!exam) {
      return res.status(404).json({
        code: "error",
        message: "Không tìm thấy đề thi hệ thống!",
      });
    }

    return res.json({
      code: "success",
      message: "Cập nhật đề thi thành công!",
    });
  } catch (error) {
    if (error.name === "ValidationError" || error.name === "CastError") {
      return res.status(400).json({
        code: "error",
        message: "Dữ liệu đề thi không hợp lệ!",
      });
    }

    next(error);
  }
};