const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  examId: {type:mongoose.Schema.Types.ObjectId,required:true},
  groupId: {type:mongoose.Schema.Types.ObjectId,default:null},
  authorId: {type:mongoose.Schema.Types.ObjectId,ref:"Account",required:true},
  quotedCommentId: {type:mongoose.Schema.Types.ObjectId,default:null},
  quoteSnapshot: {authorName:String,contentText:String},
  content: {type:String,required:true,trim:true,maxlength:5000}
},{timestamps:true});
schema.index({examId:1,groupId:1,createdAt:-1,_id:-1});
module.exports=mongoose.model("ExamComment",schema);
