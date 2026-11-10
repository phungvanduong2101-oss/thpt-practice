const mongoose=require("mongoose");
const Exam=require("../../models/exam.model");
const notifications=require("../../services/notification.service");
const Comment=require("../../models/exam-comment.model");
const valid=id=>typeof id==="string"&&mongoose.isObjectIdOrHexString(id);
const fail=(res,status,message)=>res.status(status).json({message});
exports.load=async(req,res,next)=>{
  const id=req.params.examId || req.params.id;
  if(!valid(id))return fail(res,404,"Không tìm thấy đề thi.");
  const filter={_id:id,status:"published",scope:req.group?"personal":"system"};
  if(req.group)filter.groupIds=req.group._id;
  const exam=await Exam.findOne(filter).populate("subjectId","name active").lean();
  if(!exam||!exam.subjectId?.active)return fail(res,404,"Đề thi không còn khả dụng.");
  req.discussionExam=exam;
  req.commentFilter={examId:exam._id,groupId:req.group?req.group._id:null};
  req.discussionUrl=req.group?"/groups/"+req.group._id+"/exams/"+exam._id:"/exams/"+exam._id;
  next();
};
exports.page=async(req,res)=>{
  const total=await Comment.countDocuments(req.commentFilter),pages=Math.max(1,Math.ceil(total/15));
  const requested=Number(req.query.page),page=Math.min(pages,Number.isSafeInteger(requested)&&requested>0?requested:1);
  const comments=await Comment.find(req.commentFilter).sort({createdAt:1,_id:1}).skip((page-1)*15).limit(15).populate("authorId","fullName avatarUrl").lean();
  for(const c of comments){
    c.canEdit=Boolean(req.account&&String(c.authorId?._id)===String(req.account._id));
    c.canDelete=c.canEdit||req.account?.role==="admin";
  }
  const quotedIds=comments.filter(c=>c.quotedCommentId).map(c=>c.quotedCommentId);
  const originals=await Comment.find({...req.commentFilter,_id:{$in:quotedIds}}).select("_id").lean();
  const existing=new Set(originals.map(c=>String(c._id)));
  comments.forEach(c=>c.quoteDeleted=c.quotedCommentId&&!existing.has(String(c.quotedCommentId)));
  res.render("client/exam-discussion",{
    title:req.discussionExam.title,exam:req.discussionExam,comments,total,page,pages,
    base:req.discussionUrl,group:req.group||null,
    listUrl:req.group?"/groups/"+req.group._id+"/exams":"/exams",
    takeUrl:req.discussionUrl+"/take",
  });
};
exports.create=async(req,res)=>{
  const content=typeof req.body.content==="string"?req.body.content.trim():"";
  if(!content||content.length>5000)return fail(res,400,"Bình luận cần từ 1 đến 5.000 ký tự.");
  let quoted=null;
  if(req.body.quotedCommentId){
    if(!valid(req.body.quotedCommentId))return fail(res,400,"Trích dẫn không hợp lệ.");
    quoted=await Comment.findOne({...req.commentFilter,_id:req.body.quotedCommentId}).populate("authorId","fullName").lean();
    if(!quoted)return fail(res,409,"Bình luận được trích dẫn đã bị xóa.");
  }
  const comment=await Comment.create({...req.commentFilter,authorId:req.account._id,content,
    quotedCommentId:quoted?._id,
    quoteSnapshot:quoted?{authorName:quoted.authorId?.fullName||"Tài khoản đã xóa",contentText:quoted.content.slice(0,2000)}:undefined
  });
  if(quoted?.authorId && String(quoted.authorId._id)!==String(req.account._id)){
    const recipientId=String(quoted.authorId._id);
    const allowed=!req.group || [req.group.ownerId,...req.group.memberIds].some(id=>String(id)===recipientId);
    if(allowed){
      try{
        await notifications.send(req.app.get("io"),{
          recipientId,senderId:req.account._id,type:"exam_comment_quoted",
          content:("Bạn được trích dẫn trong thảo luận đề: "+req.discussionExam.title).slice(0,500),
          link:req.discussionUrl+"/comments/"+comment._id
        });
      }catch(error){console.error("Không gửi được thông báo trích dẫn đề thi:",error);}
    }
  }
  res.json({message:"Đã đăng bình luận!",commentId:String(comment._id),redirectUrl:req.discussionUrl+"/comments/"+comment._id});
};
exports.change=async(req,res)=>{
  if(!valid(req.params.commentId))return fail(res,404,"Không tìm thấy bình luận.");
  const remove=req.path.endsWith("/delete"),filter={...req.commentFilter,_id:req.params.commentId};
  if(!remove||req.account.role!=="admin")filter.authorId=req.account._id;
  if(remove){
    const result=await Comment.deleteOne(filter);
    if(!result.deletedCount)return fail(res,403,"Không thể xóa bình luận.");
  }else{
    const content=typeof req.body.content==="string"?req.body.content.trim():"";
    if(!content||content.length>5000)return fail(res,400,"Bình luận cần từ 1 đến 5.000 ký tự.");
    const result=await Comment.updateOne(filter,{$set:{content}},{runValidators:true});
    if(!result.matchedCount)return fail(res,403,"Không thể sửa bình luận.");
  }
  res.json({message:remove?"Đã xóa bình luận.":"Đã cập nhật bình luận.",redirectUrl:req.discussionUrl+"#discussion"});
};

exports.locate=async(req,res)=>{
  if(!valid(req.params.commentId))return fail(res,404,"Không tìm thấy bình luận.");
  const comment=await Comment.findOne({...req.commentFilter,_id:req.params.commentId}).lean();
  if(!comment)return fail(res,404,"Bình luận đã bị xóa.");
  const before=await Comment.countDocuments({...req.commentFilter,$or:[
    {createdAt:{$lt:comment.createdAt}},
    {createdAt:comment.createdAt,_id:{$lt:comment._id}}
  ]});
  res.redirect(req.discussionUrl+"?page="+(Math.floor(before/15)+1)+"#exam-comment-"+comment._id);
};
