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
    const accountId = req.account._id; 
    const { examId, answers } = req.body;

    const exam = await Exam.findById(examId).lean();

    if (!exam) {
      return res.status(404).json({
        message: "Không tìm thấy đề thi.",
      });
    }

    const questions = await Question.find({
      _id: { $in: exam.questionIds },
    }).lean();

    if (!questions.length) {
      return res.status(400).json({
        message: "Đề thi chưa có câu hỏi.",
      });
    }

    const answerMap = new Map(
      answers.map(item => [String(item.questionId), item.answer])
    );

    const maxScore = 10;
    const questionMaxScore = maxScore / questions.length;

    let totalScore = 0;
    const gradedAnswers = [];

    for (const question of questions) {
      const answer = answerMap.get(String(question._id)) ?? null;
      let ratio = 0;

      if (question.type === "mcq") {
        ratio =
          answer !== null && answer === question.correctAnswer ? 1 : 0;
      }

      if (question.type === "truefalse" && answer !== null) {
        const correctCount = question.options.filter(
          option =>
            typeof answer[option.key] === "boolean" &&
            answer[option.key] === option.isCorrect
        ).length;

        ratio = question.options.length
          ? correctCount / question.options.length
          : 0;
      }

      if (question.type === "fill") {
        const accepted = [
          question.correctAnswer,
          ...(question.acceptedAnswers || []),
        ];

        ratio =
          answer !== null &&
          answer !== "" &&
          accepted.includes(answer)
            ? 1
            : 0;
      }

      const score = ratio * questionMaxScore;
      totalScore += score;

      gradedAnswers.push({
        questionId: question._id,
        type: question.type,
        answer,
        score,
        maxScore: questionMaxScore,
      });
    }

    const attempt = await Attempt.create({
      accountId,
      examId: exam._id,
      examTitle: exam.title,
      duration: exam.duration,
      answers: gradedAnswers,
      totalQuestions: questions.length,
      score: Number(totalScore.toFixed(2)),
      maxScore,
      submittedAt: new Date(),
    });

    return res.status(201).json({ 
      code: "success",
      message: "Nộp bài thành công.",
      attemptId: attempt._id,
      score: attempt.score,
      maxScore: attempt.maxScore,
    });
  } catch (error) {
    next(error);
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
    }).lean();

    if (!attempt) {
      return res.status(404).send("Không tìm thấy bài làm!");
    }

    return res.render("client/exam-result", {
      title: "Kết quả bài làm",
      activePage: "exams",
      attempt,
    });
  } catch (error) {
    next(error);
  }
};