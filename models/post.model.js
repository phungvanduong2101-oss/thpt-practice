const mongoose = require("mongoose");
const { Schema } = mongoose;
const id = Schema.Types.ObjectId;
const postSchema = new Schema(
  {
    groupId: { type: id, required: true, index: true },
    authorId: { type: id, ref: "Account", required: true },
    images: { type: [String], default: [] },
    content: { type: String, default: "", maxlength: 20000 },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
postSchema.index({ groupId: 1, createdAt: -1, _id: -1 });
const commentSchema = new Schema(
  {
    postId: { type: id, required: true, index: true },
    authorId: { type: id, ref: "Account", required: true },
    images: { type: [String], default: [] },
    content: { type: String, default: "", maxlength: 5000 },
    quotedCommentId: { type: id, default: null },
    quoteSnapshot: { authorName: String, contentText: String },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
commentSchema.index({ postId: 1, createdAt: 1, _id: 1 });
const imageSchema = new Schema({
  groupId: {type:id,required:true}, authorId:{type:id,required:true},
  url:{type:String,required:true}, publicId:String
},{timestamps:true});
module.exports = {
  Image: mongoose.model("GroupPostImage",imageSchema),
  Post: mongoose.model("GroupPost", postSchema),
  Comment: mongoose.model("GroupComment", commentSchema),
};
