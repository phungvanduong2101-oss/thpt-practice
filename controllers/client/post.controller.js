const mongoose = require("mongoose");
const { Post, Comment, Image } = require("../../models/post.model");
const notifications = require("../../services/notification.service");
const valid = (id) =>
  typeof id === "string" && mongoose.isObjectIdOrHexString(id);
const text = (value, max) =>
  typeof value === "string" && value.trim().length <= max ? value.trim() : "";
const same = (a, b) => String(a) === String(b);
const base = (req) => "/groups/" + req.group._id + "/posts";
const tabQuery = req => req.query.tab === "mine" ? "?tab=mine" : "";
const owner = (req) => same(req.group.ownerId, req.account._id);
const failure = (res, status, message) => res.status(status).json({ message });
function page(raw, total, limit) {
  const pages = Math.max(1, Math.ceil(total / limit)),
    value = Number(raw);
  return {
    pages,
    current: Math.min(
      pages,
      Number.isSafeInteger(value) && value > 0 ? value : 1,
    ),
  };
}
exports.list = async (req, res) => {
  const tab = req.query.tab === "mine" ? "mine" : "feed";
  const filter = { groupId: req.group._id, deletedAt: null };
  if (tab === "mine") filter.authorId = req.account._id;
  const total = await Post.countDocuments(filter),
    paging = page(req.query.page, total, 10);
  const posts = await Post.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .skip((paging.current - 1) * 10)
    .limit(10)
    .populate("authorId", "fullName avatarUrl")
    .lean();
  res.render("client/posts", {
    tab,
    title: "Bài viết trong nhóm",
    group: req.group,
    posts,
    total,
    paging,
    base: base(req),
  });
};
exports.load = async (req, res, next) => {
  if (!valid(req.params.postId))
    return failure(res, 404, "Không tìm thấy bài viết.");
  const post = await Post.findOne({
    _id: req.params.postId,
    groupId: req.group._id,
    deletedAt: null,
  });
  if (!post) return failure(res, 404, "Bài viết không còn khả dụng.");
  req.post = post;
  next();
};
exports.detail = async (req, res) => {
  const filter = { postId: req.post._id };
  const total = await Comment.countDocuments(filter),
    paging = page(req.query.page, total, 20);
  const comments = await Comment.find(filter)
    .sort({ createdAt: 1, _id: 1 })
    .skip((paging.current - 1) * 20)
    .limit(20)
    .populate("authorId", "fullName avatarUrl")
    .lean();
  const quotedIds = comments
    .filter((c) => c.quotedCommentId)
    .map((c) => c.quotedCommentId);
  const originals = await Comment.find({
    _id: { $in: quotedIds },
    postId: req.post._id,
  })
    .select("deletedAt createdAt")
    .lean();
  const originalMap = new Map(originals.map((c) => [String(c._id), c]));
  for (const c of comments) {
    c.canEdit = !c.deletedAt && same(c.authorId?._id, req.account._id);
    c.canDelete = !c.deletedAt && (c.canEdit || owner(req));
    if (c.quotedCommentId) {
      const source = originalMap.get(String(c.quotedCommentId));
      c.quoteDeleted = !source || Boolean(source.deletedAt);
      if (source && !source.deletedAt) {
        const before = await Comment.countDocuments({
          postId: req.post._id,
          $or: [
            { createdAt: { $lt: source.createdAt } },
            { createdAt: source.createdAt, _id: { $lt: source._id } },
          ],
        });
        c.quoteUrl =
          base(req) +
          "/" +
          req.post._id +
          "?page=" +
          (Math.floor(before / 20) + 1) +
          "#comment-" +
          source._id;
      }
    }
  }
  await req.post.populate("authorId", "fullName avatarUrl");
  res.render("client/post-detail", {
    tabQuery: tabQuery(req),
    title: "Thảo luận nhóm",
    group: req.group,
    post: req.post.toObject(),
    comments,
    paging,
    base: base(req),
    canEdit: same(req.post.authorId?._id, req.account._id),
    canDelete: same(req.post.authorId?._id, req.account._id) || owner(req),
  });
};
exports.create = async (req, res) => {
  const content = text(req.body.content, 20000);
  let images;
  try { images=await imageList(req); } catch(error) { return failure(res,400,error.message); }
  if ((!content&&!images.length) || String(req.body.content||"").length>20000)
    return failure(res,400,"Nhập nội dung hoặc chọn ảnh, tối đa 20.000 ký tự.");
  const post = await Post.create({
    groupId: req.group._id,
    authorId: req.account._id,
    content, images,
  });
  res.json({
    message: "Đăng bài thành công!",
    redirectUrl: base(req) + "/" + post._id + tabQuery(req),
  });
};
exports.edit = async (req, res) => {
  const content = text(req.body.content, 20000);
  if(!same(req.post.authorId,req.account._id))return failure(res,403,"Bạn không có quyền sửa.");
  let images;
  try { images=await imageList(req,req.post.images); } catch(error) { return failure(res,400,error.message); }
  if ((!content&&!images.length)||String(req.body.content||"").length>20000) return failure(res,400,"Nội dung không hợp lệ.");
  const r = await Post.updateOne(
    { _id: req.post._id, authorId: req.account._id, deletedAt: null },
    { $set: { content, images } },
  );
  if (!r.matchedCount)
    return failure(res, 403, "Bạn không có quyền sửa bài viết.");
  res.json({
    message: "Cập nhật bài viết thành công!",
    redirectUrl: base(req) + "/" + req.post._id + tabQuery(req),
  });
};
exports.remove = async (req, res) => {
  if (!owner(req) && !same(req.post.authorId, req.account._id))
    return failure(res, 403, "Bạn không có quyền xóa.");
  await Post.updateOne(
    { _id: req.post._id, deletedAt: null },
    { $set: { deletedAt: new Date() } },
  );
  res.json({ message: "Đã xóa bài viết.", redirectUrl: base(req) + tabQuery(req) });
};
exports.comment = async (req, res) => {
  const content = text(req.body.content, 5000);
  let images;
  try { images=await imageList(req); } catch(error) { return failure(res,400,error.message); }
  if ((!content&&!images.length)||String(req.body.content||"").length>5000) return failure(res,400,"Nhập nội dung hoặc chọn ảnh, tối đa 5.000 ký tự.");
  let quoted = null;
  if (req.body.quotedCommentId) {
    if (!valid(req.body.quotedCommentId))
      return failure(res, 400, "Trích dẫn không hợp lệ.");
    quoted = await Comment.findOne({
      _id: req.body.quotedCommentId,
      postId: req.post._id,
      deletedAt: null,
    })
      .populate("authorId", "fullName avatarUrl")
      .lean();
    if (!quoted)
      return failure(res, 409, "Bình luận được trích dẫn đã bị xóa.");
  }
  const comment = await Comment.create({
    postId: req.post._id,
    authorId: req.account._id,
    content, images,
    quotedCommentId: quoted?._id,
    quoteSnapshot: quoted
      ? {
          authorName: quoted.authorId?.fullName || "Tài khoản đã xóa",
          contentText: quoted.content.slice(0, 2000),
        }
      : undefined,
  });
  const url = base(req) + "/" + req.post._id;
  const recipientIds = [
    ...new Set([
      String(req.post.authorId),
      ...(quoted?.authorId ? [String(quoted.authorId._id)] : []),
    ]),
  ].filter((id) => !same(id, req.account._id));
  const allowed = new Set(
    [req.group.ownerId, ...req.group.memberIds].map(String),
  );
  await Promise.allSettled(
    recipientIds
      .filter((id) => allowed.has(id))
      .map((recipientId) =>
        notifications.send(req.app.get("io"), {
          recipientId,
          senderId: req.account._id,
          type: "group_post_comment",
          content:
            quoted?.authorId && same(recipientId, quoted.authorId._id)
              ? "Bạn được trích dẫn trong thảo luận nhóm."
              : "Bài viết của bạn có bình luận mới.",
          link: url + "/comments/" + comment._id,
        }),
      ),
  );
  res.json({
    message: "Đã đăng bình luận!",
    redirectUrl: url + "/comments/" + comment._id,
  });
};
exports.locate = async (req, res) => {
  if (!valid(req.params.commentId))
    return failure(res, 404, "Không tìm thấy bình luận.");
  const c = await Comment.findOne({
    _id: req.params.commentId,
    postId: req.post._id,
  }).lean();
  if (!c) return failure(res, 404, "Không tìm thấy bình luận.");
  const before = await Comment.countDocuments({
    postId: req.post._id,
    $or: [
      { createdAt: { $lt: c.createdAt } },
      { createdAt: c.createdAt, _id: { $lt: c._id } },
    ],
  });
  res.redirect(
    base(req) +
      "/" +
      req.post._id +
      "?page=" +
      (Math.floor(before / 20) + 1) +
      "#comment-" +
      c._id,
  );
};
exports.changeComment = async (req, res) => {
  if (!valid(req.params.commentId))
    return failure(res, 404, "Không tìm thấy bình luận.");
  const remove = req.path.endsWith("/delete");
  const filter = {
    _id: req.params.commentId,
    postId: req.post._id,
    deletedAt: null,
  };
  if (!remove || !owner(req)) filter.authorId = req.account._id;
  const content = text(req.body.content, 5000);
  const original=await Comment.findOne(filter).lean();
  if(!original)return failure(res,403,"Bạn không có quyền sửa hoặc xóa bình luận.");
  let images=original.images||[];
  if(!remove){
    try { images=await imageList(req,images); } catch(error) { return failure(res,400,error.message); }
    if((!content&&!images.length)||String(req.body.content||"").length>5000)return failure(res,400,"Bình luận không hợp lệ.");
  }
  const r = await Comment.updateOne(filter, {
    $set: remove ? { deletedAt: new Date() } : { content, images },
  });
  if (!r.matchedCount)
    return failure(res, 403, "Bạn không có quyền hoặc bình luận đã bị xóa.");
  res.json({
    message: remove ? "Đã xóa bình luận." : "Đã sửa bình luận.",
    redirectUrl:
      base(req) + "/" + req.post._id + "/comments/" + req.params.commentId,
  });
};


exports.upload = async (req,res) => {
  if(!req.file)return failure(res,400,"Vui lòng chọn ảnh.");
  const cloudinary=require("../../config/cloudinary");
  const uploaded=await new Promise((resolve,reject)=>{
    const stream=cloudinary.uploader.upload_stream({
      folder:"thpt-practice/posts",resource_type:"image",
      allowed_formats:["jpg","jpeg","png","webp","gif"]
    },(error,result)=>error?reject(error):resolve(result));
    stream.end(req.file.buffer);
  });
  try {
    const image=await Image.create({groupId:req.group._id,authorId:req.account._id,url:uploaded.secure_url,publicId:uploaded.public_id});
    res.json({url:image.url});
  } catch(error) {
    await cloudinary.uploader.destroy(uploaded.public_id).catch(()=>{});
    throw error;
  }
};
async function imageList(req, existing=[]) {
  if(req.body.images===undefined)return existing;
  const urls=req.body.images;
  if(!Array.isArray(urls)||urls.length>6||urls.some(url=>typeof url!=="string"))throw new Error("Tối đa 6 ảnh cho mỗi bài viết hoặc bình luận.");
  const unique=[...new Set(urls)];
  const records=await Image.find({groupId:req.group._id,authorId:req.account._id,url:{$in:unique}}).select("url").lean();
  const allowed=new Set([...existing,...records.map(image=>image.url)]);
  if(unique.some(url=>!allowed.has(url)))throw new Error("Ảnh không hợp lệ hoặc không thuộc bạn.");
  return unique;
}
