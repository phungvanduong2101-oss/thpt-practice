const { Assignment, Work } = require("../models/homework.model");
const grade = require("./grade-attempt");
function shuffle(questions) {
  const result = questions.slice();
  // Exam currently stores one flat questionIds list.
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
function finish(work, draft, expired) {
  const { gradedAnswers, totalScore } = grade(
    work,
    new Map(Object.entries(draft || {})),
  );
  return {
    draft,
    answers: gradedAnswers,
    score: Number(totalScore.toFixed(2)),
    expired,
    status: "submitted",
    submittedAt: new Date(),
  };
}
async function closeExpired() {
  for await (const assignment of Assignment.find({ due: { $lte: new Date() } })
    .select("_id")
    .cursor()) {
    for await (const work of Work.find({
      assignmentId: assignment._id,
      status: "in_progress",
    })
      .lean()
      .cursor()) {
      await Work.updateOne(
        { _id: work._id, __v: work.__v, status: "in_progress" },
        { $set: finish(work, work.draft, true), $inc: { __v: 1 } },
      );
    }
  }
}
module.exports = { shuffle, finish, closeExpired };
