const mongoose = require("mongoose");
const Exam = require("../../models/exam.model");
const Subject = require("../../models/subject.model");
const Question = require("../../models/question.model"); 
const Attempt = require("../../models/attempt.model"); 

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

    const subjects = await Subject.find({ active: true })
      .select("name")
      .sort({ name: 1 })
      .lean();

    // Chỉ hiển thị đề công khai của hệ thống,
    // thuộc môn học đang hoạt động.
    const filter = {
      status: "published",
      groupId: null,
      subjectId: {
        $in: subjects.map(subject => subject._id),
      },
    };

    if (subjectId !== "all") {
      filter.subjectId.$eq = new mongoose.Types.ObjectId(subjectId);
    }

    if (keyword) {
      const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      filter.title = {
        $regex: escaped,
        $options: "i",
      };
    }

    const limit = 9;
    const requestedPage = Number(req.query.page);

    let currentPage =
      Number.isSafeInteger(requestedPage) && requestedPage > 0
        ? requestedPage
        : 1;

    const totalItems = await Exam.countDocuments(filter);
    const totalPages = Math.max(1, Math.ceil(totalItems / limit));

    currentPage = Math.min(currentPage, totalPages);

    const skip = (currentPage - 1) * limit;

    const records = await Exam.find(filter)
      .select("title subjectId duration description questionIds")
      .populate("subjectId", "name")
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // View chỉ nhận số câu, không cần danh sách ID câu hỏi.
    const exams = records.map(({ questionIds, ...exam }) => ({
      ...exam,
      questionCount: questionIds?.length || 0,
    }));

    const pageUrl = page => {
      const params = new URLSearchParams({
        keyword,
        subjectId,
        page: String(page),
      });

      return `/exams?${params.toString()}`;
    };

    return res.render("client/exam", {
      title: "Danh sách đề thi",
      activePage: "exams",

      exams,
      subjects,
      keyword,
      subjectId,

      totalItems,
      currentPage,
      totalPages,
      startItem: totalItems ? skip + 1 : 0,
      endItem: skip + exams.length,
      pageUrl,
    });
  } catch (error) { 
    
    return next(error);
  }
}; 

module.exports.detail = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.isObjectIdOrHexString(id)) {
      return res.status(404).send("Không tìm thấy đề thi!");
    }

    const exam = await Exam.findOne({
      _id: id,
      status: "published",
      groupId: null,
    })
      .select("title description duration subjectId questionIds")
      .populate("subjectId", "name active")
      .lean();

    if (!exam || !exam.subjectId || !exam.subjectId.active) {
      return res.status(404).send("Đề thi không còn khả dụng!");
    }

    // Chỉ lấy dữ liệu hiển thị, không lấy đáp án đúng và lời giải.
    const records = await Question.find({
      _id: { $in: exam.questionIds },
      subjectId: exam.subjectId._id,
      published: true,
      groupId: null,
    })
      .select("_id type content contentText options.key options.content")
      .lean();

    const questionMap = new Map(
      records.map(question => [String(question._id), question])
    );

    // Giữ thứ tự câu hỏi admin đã sắp trong đề.
    const questions = exam.questionIds.map(id =>
      questionMap.get(String(id))
    );

    if (!questions.length || questions.some(question => !question)) {
      return res.status(409).send(
        "Đề thi có câu hỏi không còn khả dụng. Vui lòng chọn đề khác!"
      );
    }

    return res.render("client/exam-taking", {
      title: exam.title,
      activePage: "exams",
      exam,
      questions,
    });
  } catch (error) {
    return next(error);
  }
}; 

module.exports.submit = async (req, res, next) => {
  try {
    if (!req.account) {
      return res.status(401).json({
        code: "error",
        message: "Vui lòng đăng nhập để nộp bài.",
      });
    }

    const accountId = req.account._id;
    const { attemptId, answers } = req.body;

    if (!attemptId || !Array.isArray(answers)) {
      return res.status(400).json({
        code: "error",
        message: "Dữ liệu bài làm không hợp lệ.",
      });
    }

    const attempt = await Attempt.findOne({
      _id: attemptId,
      accountId,
    }).lean();

    if (!attempt) {
      return res.status(404).json({
        code: "error",
        message: "Không tìm thấy bài làm.",
      });
    }

    if (attempt.status !== "in_progress") {
      return res.status(409).json({
        code: "error",
        message: "Bài làm đã được nộp.",
      });
    }

    const questions = attempt.questions;

    if (!questions || !questions.length) {
      return res.status(400).json({
        code: "error",
        message: "Bài làm chưa có dữ liệu câu hỏi.",
      });
    }

    const answerMap = new Map();

    for (const item of answers) {
      if (!item || typeof item.questionId !== "string") {
        return res.status(400).json({
          code: "error",
          message: "Dữ liệu câu trả lời không hợp lệ.",
        });
      }

      answerMap.set(item.questionId, item.answer);
    }

    const maxScore = attempt.maxScore;
    const questionMaxScore = maxScore / questions.length;

    let totalScore = 0;
    const gradedAnswers = [];

    for (const question of questions) {
      let answer = answerMap.get(String(question.questionId));

      if (answer === undefined || answer === null) {
        answer = null;
      }

      let ratio = 0;

      if (question.type === "mcq") {
        if (
          typeof answer === "string" &&
          answer !== "" &&
          answer === question.correctAnswer
        ) {
          ratio = 1;
        }
      }

      if (question.type === "truefalse") {
        if (
          answer !== null &&
          typeof answer === "object" &&
          !Array.isArray(answer)
        ) {
          let correctCount = 0;

          for (const option of question.options) {
            if (
              typeof answer[option.key] === "boolean" &&
              answer[option.key] === option.isCorrect
            ) {
              correctCount++;
            }
          }

          if (question.options.length > 0) {
            ratio = correctCount / question.options.length;
          }
        }
      }

      if (question.type === "fill") {
        const accepted = [
          question.correctAnswer,
          ...(question.acceptedAnswers || []),
        ];

        if (
          typeof answer === "string" &&
          answer !== "" &&
          accepted.includes(answer)
        ) {
          ratio = 1;
        }
      }

      const score = ratio * questionMaxScore;

      totalScore += score;

      gradedAnswers.push({
        questionId: question.questionId,
        type: question.type,
        answer,
        score,
        maxScore: questionMaxScore,
      });
    }

    // Chỉ cập nhật nếu bài vẫn chưa nộp.
    // Tránh hai request nộp bài cùng ghi đè kết quả.
    const submittedAttempt = await Attempt.findOneAndUpdate(
      {
        _id: attempt._id,
        accountId,
        status: "in_progress",
      },
      {
        $set: {
          answers: gradedAnswers,
          score: Number(totalScore.toFixed(2)),
          status: "submitted",
          submittedAt: new Date(),
        },
      },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!submittedAttempt) {
      return res.status(409).json({
        code: "error",
        message: "Bài làm đã được nộp.",
      });
    }

    return res.status(200).json({
      code: "success",
      message: "Nộp bài thành công.",
      attemptId: submittedAttempt._id,
      score: submittedAttempt.score,
      maxScore: submittedAttempt.maxScore,
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        code: "error",
        message: "ID bài làm không hợp lệ.",
      });
    }

    return next(error);
  }
};

module.exports.result = async (req, res, next) => {
  try {
    const { attemptId } = req.params;

    if (!mongoose.isObjectIdOrHexString(attemptId)) {
      return res.status(404).send("Không tìm thấy bài làm!");
    }

    const attempt = await Attempt.findOne({
      _id: attemptId,
      accountId: req.account._id,
      status: "submitted",
    }).lean();

    if (!attempt) {
      return res.status(404).send("Không tìm thấy bài làm!");
    }

    let groupId = attempt.groupId;
    if (!groupId) {
      const sourceExam = await Exam.findById(attempt.examId).select("groupId").lean();
      if (sourceExam) groupId = sourceExam.groupId;
    }
    let listUrl = "/exams";
    let retryUrl = "/exams/" + attempt.examId;
    if (groupId) {
      listUrl = "/groups/" + groupId + "/exams";
      retryUrl = listUrl + "/" + attempt.examId + "/take";
    }
    return res.render("client/exam-result", {
      listUrl,
      retryUrl,
      title: "Kết quả bài làm",
      activePage: "exams",
      attempt,
    });
  } catch (error) {
    next(error);
  }
}; 

module.exports.start = async (req, res, next) => {
  try {
    if (!req.account) {
      return res.status(401).json({
        code: "error",
        message: "Vui lòng đăng nhập để làm bài.",
      });
    }

    const { examId } = req.params;

    const exam = await Exam.findOne({
      _id: examId,
      status: "published",
      groupId: null,
    })
      .populate("subjectId", "active")
      .lean();

    if (!exam || !exam.subjectId?.active) {
      return res.status(404).json({
        code: "error",
        message: "Đề thi không còn khả dụng.",
      });
    }

    const records = await Question.find({
      _id: { $in: exam.questionIds },
      subjectId: exam.subjectId._id,
      published: true,
      groupId: null,
    }).lean();

    const questionMap = new Map(
      records.map(question => [String(question._id), question])
    );

    // Giữ thứ tự câu hỏi trong đề.
    const questions = exam.questionIds.map(id =>
      questionMap.get(String(id))
    );

    if (!questions.length || questions.some(question => !question)) {
      return res.status(409).json({
        code: "error",
        message: "Đề thi có câu hỏi không còn khả dụng.",
      });
    }

    const snapshots = questions.map(question => ({
      questionId: question._id,
      type: question.type,
      content: question.content,
      contentText: question.contentText,
      options: question.options,
      correctAnswer: question.correctAnswer,
      acceptedAnswers: question.acceptedAnswers,
      explanation: question.explanation,
    }));

    const attempt = await Attempt.create({
      accountId: req.account._id,
      examId: exam._id,
      subjectId: exam.subjectId._id,
      examTitle: exam.title,
      duration: exam.duration,
      status: "in_progress",
      questions: snapshots,
      totalQuestions: snapshots.length,
      maxScore: 10,
      startedAt: new Date(),
    });

    return res.status(201).json({
      code: "success",
      message: "Tạo bài làm thành công. Nhấn OK để bắt đầu.",
      attemptId: attempt._id,
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        code: "error",
        message: "ID không hợp lệ.",
      });
    }

    return next(error);
  }
};