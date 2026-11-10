const { Assignment, Work } = require("../models/homework.model");
const Group = require("../models/group.model");
const grade = require("./grade-attempt");
function shuffle(questions) {
  const result = questions.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
function finish(work, draft, expired) {
  const { gradedAnswers, totalScore } = grade(work, new Map(Object.entries(draft || {})));
  return {
    draft: draft || {}, answers: gradedAnswers,
    score: Number(totalScore.toFixed(2)), expired,
    status: "submitted", submittedAt: new Date(),
  };
}
function deadline(assignment, work) {
  return new Date(Math.min(new Date(assignment.due).getTime(), work?.expiresAt ? new Date(work.expiresAt).getTime() : Infinity));
}
function canWork(assignment, work, now = Date.now()) {
  return (!work || work.status === "in_progress") && deadline(assignment, work).getTime() > now;
}
// $$NOW is evaluated by MongoDB, including when an operation waits on a write lock.
// Do not replace this with a JavaScript Date computed before awaiting the query.
function deadlineComparison(assignment, operator) {
  const due = { $literal: assignment.due };
  return { [operator === "$gt" ? "$and" : "$or"]: [
    { [operator]: [{ $ifNull: ["$expiresAt", due] }, "$$NOW"] },
    { [operator]: [due, "$$NOW"] },
  ] };
}
function liveWriteFilter(assignment, work, version) {
  return {
    _id: work._id, status: "in_progress", __v: version,
    $expr: deadlineComparison(assignment, "$gt"),
  };
}
async function emitProgress(io, assignment) {
  if (!io) return;
  const group = await Group.findById(assignment.groupId).select("ownerId").lean();
  if (group) io.to("account:" + group.ownerId).emit("homework:progress", String(assignment._id));
}
async function settleExpired(assignment, work, io) {
  // A concurrent successful save increments __v. Re-read and grade its confirmed
  // draft instead of submitting the stale version that this worker first read.
  for (let retry = 0; work && work.status === "in_progress" && !canWork(assignment, work) && retry < 4; retry++) {
    const result = await Work.updateOne({
      _id: work._id, __v: work.__v, status: "in_progress",
      $expr: deadlineComparison(assignment, "$lte"),
    }, { $set: finish(work, work.draft, true), $inc: { __v: 1 } });
    if (result.modifiedCount) {
      const submitted = await Work.findById(work._id).lean();
      io?.to("account:" + work.accountId).emit("homework:expired", {
        assignmentId: String(assignment._id), workId: String(work._id),
        status: "submitted", expired: true, serverNow: Date.now(), expiresAt: deadline(assignment, work),
      });
      await emitProgress(io, assignment);
      return submitted;
    }
    work = await Work.findById(work._id).lean();
  }
  return work;
}
async function closeExpired(io) {
  const now = new Date();
  // Timed work is found directly through (status, expiresAt). Legacy attempts
  // have no expiresAt and retain their assignment's current common deadline.
  for await (const work of Work.find({
    status: "in_progress",
    $or: [{ expiresAt: { $lte: now } }, { expiresAt: null }],
  }).lean().cursor()) {
    const assignment = await Assignment.findById(work.assignmentId).lean();
    if (assignment) await settleExpired(assignment, work, io);
  }
}
module.exports = { shuffle, finish, deadline, canWork, liveWriteFilter, settleExpired, closeExpired, emitProgress };
