const mongoose = require("mongoose");
const Attempt = require("../../models/attempt.model");
const Exam = require("../../models/exam.model");
const Subject = require("../../models/subject.model");

module.exports.index = async (req, res, next) => {
  try {
    if (!req.account) return res.redirect("/auth/login");

    const subjects = await Subject.find({}).select("name code").sort({ name: 1 }).lean();
    const mathIndex = subjects.findIndex(subject => {
      const name = subject.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
      return name === "toan" || name === "toan hoc";
    });
    if (mathIndex > 0) subjects.unshift(subjects.splice(mathIndex, 1)[0]);

    let selectedSubject = subjects[0] || null;
    if (typeof req.query.subjectId === "string") {
      const requested = subjects.find(subject => String(subject._id) === req.query.subjectId);
      if (requested) selectedSubject = requested;
    }

    let currentPage = Number(req.query.page);
    if (!Number.isSafeInteger(currentPage) || currentPage < 1) currentPage = 1;
    const limit = 10;
    let totalItems = 0;
    let averageScore = null;
    let bestScore = null;
    let attempts = [];
    let totalPages = 1;

    if (selectedSubject) {
      // Ưu tiên môn đã lưu trong Attempt; bài cũ lấy môn từ đề thi.
      const pipeline = [
        { $match: {
          accountId: new mongoose.Types.ObjectId(String(req.account._id)),
          status: "submitted",
        } },
        { $lookup: { from: Exam.collection.name, localField: "examId", foreignField: "_id", as: "examInfo" } },
        { $set: { historySubjectId: { $ifNull: ["$subjectId", { $arrayElemAt: ["$examInfo.subjectId", 0] }] } } },
        { $match: { historySubjectId: selectedSubject._id } },
      ];
      const [stats] = await Attempt.aggregate([
        ...pipeline,
        { $group: { _id: null, total: { $sum: 1 }, average: { $avg: "$score" }, best: { $max: "$score" } } },
      ]);
      if (stats) {
        totalItems = stats.total;
        averageScore = stats.average;
        bestScore = stats.best;
      }
      totalPages = Math.max(1, Math.ceil(totalItems / limit));
      currentPage = Math.min(currentPage, totalPages);
      attempts = await Attempt.aggregate([
        ...pipeline,
        { $sort: { submittedAt: -1, _id: -1 } },
        { $skip: (currentPage - 1) * limit },
        { $limit: limit },
        { $project: { examTitle: 1, totalQuestions: 1, score: 1, maxScore: 1, submittedAt: 1 } },
      ]);
    } else {
      currentPage = 1;
    }

    const pageUrl = page => {
      const params = new URLSearchParams({ page: String(page) });
      if (selectedSubject) params.set("subjectId", String(selectedSubject._id));
      return `/attempts?${params.toString()}`;
    };
    const pageNumbers = [];
    for (let page = Math.max(1, currentPage - 2); page <= Math.min(totalPages, currentPage + 2); page++) {
      pageNumbers.push(page);
    }

    return res.render("client/attempts", {
      title: "Lịch sử làm bài", activePage: "attempts",
      subjects, selectedSubject, attempts, averageScore, bestScore,
      totalItems, totalPages, currentPage, pageNumbers, pageUrl,
      startItem: totalItems ? (currentPage - 1) * limit + 1 : 0,
      endItem: Math.min(currentPage * limit, totalItems),
    });
  } catch (error) {
    return next(error);
  }
};
