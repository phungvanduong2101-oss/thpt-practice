const mongoose = require("mongoose");
const Group = require("../models/group.model");
const Exam = require("../models/exam.model");
const Subject = require("../models/subject.model");
const ExamComment = require("../models/exam-comment.model");
const { Post, Comment } = require("../models/post.model");
const same = (a, b) => String(a) === String(b);
const valid = id => typeof id === "string" && mongoose.isObjectIdOrHexString(id);
function fail(status, message) { throw Object.assign(new Error(message), { status }); }
async function groupContext(id, account, memberRequired = true) {
  const group = await Group.findById(id).lean();
  if (!group || (memberRequired && group.status !== "active")) fail(404, "Nhóm không còn khả dụng.");
  if (memberRequired && !same(group.ownerId, account._id) && !group.memberIds.some(x => same(x, account._id)))
    fail(403, "Bạn không có quyền truy cập nội dung nhóm.");
  return group;
}
async function examContext(id, group) {
  const filter = { _id: id, status: "published", scope: group ? "personal" : "system" };
  if (group) filter.groupIds = group._id;
  const exam = await Exam.findOne(filter).lean();
  if (!exam || !await Subject.exists({ _id: exam.subjectId, active: true })) fail(404, "Đề thi không còn khả dụng.");
  return exam;
}
async function resolveTarget(body, account) {
  const { targetType, targetId } = body;
  if (!valid(targetId) || !["group", "exam", "post", "post_comment", "exam_comment"].includes(targetType))
    fail(400, "Đối tượng báo cáo không hợp lệ.");
  if (body.groupId && !valid(body.groupId)) fail(400, "Nhóm không hợp lệ.");
  let group = null, title = "", content = "", url = "", scope = "system";
  if (targetType === "group") {
    group = await groupContext(targetId, account, false);
    title = group.name; content = group.description; url = "/groups/" + group._id;
  } else if (targetType === "post" || targetType === "post_comment") {
    const comment = targetType === "post_comment" ? await Comment.findOne({ _id: targetId, deletedAt: null }).lean() : null;
    if (targetType === "post_comment" && !comment) fail(404, "Bình luận đã bị xóa.");
    const post = await Post.findOne({ _id: comment ? comment.postId : targetId, deletedAt: null }).lean();
    if (!post) fail(404, "Bài viết đã bị xóa.");
    group = await groupContext(post.groupId, account);
    if (body.groupId && !same(body.groupId, group._id)) fail(400, "Nội dung không thuộc nhóm này.");
    scope = "group"; title = comment ? "Bình luận bài viết" : "Bài viết trong nhóm";
    content = comment ? comment.content : post.content;
    url = "/groups/" + group._id + "/posts/" + post._id + (comment ? "/comments/" + comment._id : "");
  } else if (targetType === "exam_comment") {
    const comment = await ExamComment.findById(targetId).lean();
    if (!comment) fail(404, "Bình luận đã bị xóa.");
    // Derive the scope from the stored comment, never from client-provided scope.
    group = comment.groupId ? await groupContext(comment.groupId, account) : null;
    if (body.groupId && (!group || !same(body.groupId, group._id))) fail(400, "Bình luận không thuộc nhóm này.");
    const exam = await examContext(comment.examId, group);
    scope = group ? "group" : "system"; title = "Bình luận đề: " + exam.title;
    content = comment.content;
    url = (group ? "/groups/" + group._id : "") + "/exams/" + exam._id + "/comments/" + comment._id;
  } else {
    group = body.groupId ? await groupContext(body.groupId, account) : null;
    const exam = await examContext(targetId, group);
    scope = group ? "group" : "system"; title = exam.title; content = exam.description;
    url = (group ? "/groups/" + group._id : "") + "/exams/" + exam._id;
  }
  return {
    targetType, targetId, scope,
    groupId: group?._id || null,
    recipientId: scope === "group" ? group.ownerId : null,
    snapshot: { title: title.slice(0, 200), content: (content || "").slice(0, 2000), url, groupName: group?.name || "" },
  };
}
const reasons = { spam: "Spam / quảng cáo", inappropriate: "Nội dung không phù hợp", incorrect: "Nội dung sai / lỗi đề", copyright: "Vi phạm bản quyền", other: "Lý do khác" };
const statuses = { pending: "Chờ xử lý", reviewing: "Đang xem xét", resolved: "Đã xử lý", rejected: "Từ chối" };
const types = { group: "Nhóm", exam: "Đề thi", post: "Bài viết", post_comment: "Bình luận bài viết", exam_comment: "Bình luận đề thi" };
module.exports = { resolveTarget, groupContext, same, valid, fail, reasons, statuses, types };
