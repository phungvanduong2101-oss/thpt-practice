const mongoose = require("mongoose");
const Exam = require("../../models/exam.model");
const Subject = require("../../models/subject.model");
const Topic = require("../../models/topic.model");
const Question = require("../../models/question.model");

// Câu hỏi hệ thống hoặc câu hỏi cá nhân của người đang đăng nhập.
function questionAccess(accountId) {
  return [
    { scope: "system" },
    {
      scope: "personal",
      createdBy: accountId,
    },
  ];
}

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

    // Chỉ lấy đề của người đang đăng nhập.
    const baseFilter = {
      createdBy: req.account._id,
      scope: "personal",
    };

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

      return `/my/exams?${params.toString()}`;
    };

    res.render("client/personal-exams", {
      title: "Đề thi của tôi",
      activePage: "my",

      subjects,
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

    const title = typeof body.title === "string"
      ? body.title.trim()
      : "";

    const description = typeof body.description === "string"
      ? body.description.trim()
      : "";

    const duration = Number(body.duration);

    function reject(message) {
      return res.status(400).json({
        code: "error",
        message,
      });
    }

    if (editing && !mongoose.isObjectIdOrHexString(req.params.examId)) {
      return reject("ID đề thi không hợp lệ.");
    }

    if (title.length < 5 || title.length > 120) {
      return reject("Tên đề phải có từ 5 đến 120 ký tự.");
    }

    if (description.length > 500) {
      return reject("Mô tả tối đa 500 ký tự.");
    }

    if (!Number.isInteger(duration) || duration < 1 || duration > 300) {
      return reject("Thời gian phải là số nguyên từ 1 đến 300 phút.");
    }

    if (!["draft", "published"].includes(status)) {
      return reject("Trạng thái đề không hợp lệ.");
    }

    if (!mongoose.isObjectIdOrHexString(subjectId)) {
      return reject("Vui lòng chọn môn học hợp lệ.");
    }

    const subject = await Subject.findOne({
      _id: subjectId,
      active: true,
    }).lean();

    if (!subject) {
      return reject("Môn học không tồn tại hoặc đã ngừng hoạt động.");
    }

    if (!Array.isArray(questionIds) || questionIds.length === 0) {
      return reject("Đề thi phải có ít nhất một câu hỏi.");
    }

    if (!questionIds.every(id => mongoose.isObjectIdOrHexString(id))) {
      return reject("Danh sách câu hỏi không hợp lệ.");
    }

    const uniqueIds = new Set(
      questionIds.map(id => String(id).toLowerCase())
    );

    if (uniqueIds.size !== questionIds.length) {
      return reject("Không được chọn trùng câu hỏi.");
    }

    // Chỉ nhận câu hỏi hệ thống hoặc câu hỏi của mình,
    // đúng môn và đã xuất bản.
    const questions = await Question.find({
      _id: { $in: questionIds },
      subjectId: subject._id,
      published: true,
      $or: questionAccess(req.account._id),
    })
      .select("_id")
      .lean();

    if (questions.length !== questionIds.length) {
      return reject(
        "Có câu hỏi không thuộc hệ thống/cá nhân của bạn, " +
        "sai môn, chưa xuất bản hoặc đã bị xóa."
      );
    }

    const changes = {
      title,
      subjectId: subject._id,
      duration,
      description,
      status,
      questionIds,
    };

    if (editing) {
      const exam = await Exam.findOneAndUpdate(
        {
          _id: req.params.examId,
          createdBy: req.account._id,
          scope: "personal",
        },
        { $set: changes },
        {
          new: true,
          runValidators: true,
        }
      );

      if (!exam) {
        return res.status(404).json({
          code: "error",
          message: "Không tìm thấy đề của bạn.",
        });
      }

      return res.json({
        code: "success",
        message: "Cập nhật đề thi thành công!",
        examId: exam._id,
      });
    }

    const exam = await Exam.create({
      ...changes,
      createdBy: req.account._id,
      scope: "personal",
    });

    return res.status(201).json({
      code: "success",
      message: "Tạo đề thi thành công!",
      examId: exam._id,
    });
  } catch (error) {
    if (error.name === "CastError" || error.name === "ValidationError") {
      return res.status(400).json({
        code: "error",
        message: "Dữ liệu đề thi hoặc ID không hợp lệ.",
      });
    }

    next(error);
  }
}

module.exports.create = (req, res, next) => {
  return saveExam(req, res, next, false);
};

module.exports.update = (req, res, next) => {
  return saveExam(req, res, next, true);
};

module.exports.remove = async (req, res, next) => {
  try {
    if (!mongoose.isObjectIdOrHexString(req.params.examId)) {
      return res.status(400).json({
        code: "error",
        message: "ID đề không hợp lệ.",
      });
    }

    const exam = await Exam.findOneAndDelete({
      _id: req.params.examId,
      createdBy: req.account._id,
      scope: "personal",
    });

    if (!exam) {
      return res.status(404).json({
        code: "error",
        message: "Không tìm thấy đề của bạn.",
      });
    }

    // Giữ nguyên lịch sử và snapshot bài làm.
    return res.json({
      code: "success",
      message: "Đã xóa đề thi.",
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        code: "error",
        message: "ID đề không hợp lệ.",
      });
    }

    next(error);
  }
};

// Danh sách câu hỏi cho modal chọn câu hỏi vào đề.
module.exports.questions = async (req, res, next) => {
  try {
    const { subjectId } = req.query;

    if (!mongoose.isObjectIdOrHexString(subjectId)) {
      return res.status(400).json({
        code: "error",
        message: "Vui lòng chọn môn học hợp lệ.",
      });
    }

    const subject = await Subject.findOne({
      _id: subjectId,
      active: true,
    }).lean();

    if (!subject) {
      return res.status(400).json({
        code: "error",
        message: "Môn học không khả dụng.",
      });
    }

    const filter = {
      subjectId: subject._id,
      published: true,
      $or: questionAccess(req.account._id),
    };

    const source = req.query.source ?? "all";

    if (source === "system") {
      delete filter.$or;
      filter.scope = "system";
    } else if (source === "personal") {
      delete filter.$or;
      filter.scope = "personal";
      filter.createdBy = req.account._id;
    } else if (source !== "all") {
      return res.status(400).json({
        code: "error",
        message: "Nguồn câu hỏi không hợp lệ.",
      });
    }

    if (
      typeof req.query.topicId === "string" &&
      req.query.topicId &&
      req.query.topicId !== "all"
    ) {
      if (!mongoose.isObjectIdOrHexString(req.query.topicId)) {
        return res.status(400).json({
          code: "error",
          message: "ID chuyên đề không hợp lệ.",
        });
      }

      filter.topicId = req.query.topicId;
    }

    if (["mcq", "truefalse", "fill"].includes(req.query.type)) {
      filter.type = req.query.type;
    }

    if (["1", "2", "3", "4", "5", "6"].includes(req.query.bloomLevel)) {
      filter.bloomLevel = Number(req.query.bloomLevel);
    }

    if (typeof req.query.keyword === "string" && req.query.keyword.trim()) {
      const escaped = req.query.keyword
        .trim()
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      filter.contentText = {
        $regex: escaped,
        $options: "i",
      };
    }

    const limit = 8;
    let currentPage = Number(req.query.page);

    if (!Number.isSafeInteger(currentPage) || currentPage < 1) {
      currentPage = 1;
    }

    const totalItems = await Question.countDocuments(filter);
    const totalPages = Math.max(1, Math.ceil(totalItems / limit));

    currentPage = Math.min(currentPage, totalPages);

    const questions = await Question.find(filter)
      .select(
        "subjectId topicId type bloomLevel content contentText " +
        "options correctAnswer acceptedAnswers explanation " +
        "published createdBy scope"
      )
      .sort({ createdAt: -1, _id: -1 })
      .skip((currentPage - 1) * limit)
      .limit(limit)
      .lean();

    return res.json({
      code: "success",
      questions,
      totalItems,
      currentPage,
      totalPages,
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        code: "error",
        message: "ID không hợp lệ.",
      });
    }

    next(error);
  }
};

module.exports.form = async (req, res, next) => {
  try {
    let exam = null;
    const id = req.params.examId;
    if (id) {
      if (!mongoose.isObjectIdOrHexString(id)) return res.status(400).send("ID đề thi không hợp lệ.");
      exam = await Exam.findOne({ _id: id, ...{ scope: "personal", createdBy: req.account._id } }).lean();
      if (!exam) return res.status(404).send("Không tìm thấy đề thi.");
    }
    const [subjects, topics, questions] = await Promise.all([
      Subject.find().select("name code active").sort({ name: 1 }).lean(),
      Topic.find().select("name code subjectId active").sort({ name: 1 }).lean(),
      Question.find({ _id: { $in: exam?.questionIds || [] }, $or: questionAccess(req.account._id) }).lean(),
    ]);
    res.render("client/personal-exam-form", {
      title: exam ? "Chỉnh sửa đề thi" : "Soạn đề thi mới",
      activePage: "my", subjects, topics, questions, exam,
    });
  } catch (error) { next(error); }
};
