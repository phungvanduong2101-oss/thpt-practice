const Account = require("../../models/account.model");
const bcrypt = require("bcryptjs");
const cloudinary = require("../../config/cloudinary");
const fail = (res,status,message)=>res.status(status).json({message});
exports.page=(req,res)=>res.render("client/account",{title:"Quản lý thông tin tài khoản",account:req.account});
exports.profile=async(req,res)=>{
  const fullName=typeof req.body.fullName==="string"?req.body.fullName.trim():"";
  if(fullName.length<2||fullName.length>80)return fail(res,400,"Tên phải từ 2 đến 80 ký tự.");
  await Account.updateOne({_id:req.account._id},{$set:{fullName}},{runValidators:true});
  res.json({message:"Cập nhật thông tin thành công!"});
};
exports.email=async(req,res)=>{
  const email=typeof req.body.email==="string"?req.body.email.trim().toLowerCase():"";
  if(email.length>254||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return fail(res,400,"Email không hợp lệ.");
  const account=await Account.findById(req.account._id).select("+password");
  if(typeof req.body.currentPassword!=="string"||!await bcrypt.compare(req.body.currentPassword,account.password))return fail(res,400,"Mật khẩu hiện tại không đúng.");
  try{
    const result=await Account.updateOne({_id:account._id,password:account.password},{$set:{email}},{runValidators:true});
    if(!result.matchedCount)return fail(res,409,"Tài khoản đã thay đổi. Vui lòng thử lại.");
    res.json({message:"Đổi email thành công! Lần đăng nhập sau hãy dùng email mới."});
  }catch(error){if(error.code===11000)return fail(res,409,"Email đã được sử dụng.");throw error;}
};
exports.password=async(req,res)=>{
  const {currentPassword,newPassword,confirmPassword}=req.body;
  if(typeof newPassword!=="string"||newPassword.length<8||Buffer.byteLength(newPassword)>72)return fail(res,400,"Mật khẩu mới cần ít nhất 8 ký tự và tối đa 72 byte.");
  if(newPassword!==confirmPassword)return fail(res,400,"Xác nhận mật khẩu không khớp.");
  const account=await Account.findById(req.account._id).select("+password");
  if(typeof currentPassword!=="string"||!await bcrypt.compare(currentPassword,account.password))return fail(res,400,"Mật khẩu hiện tại không đúng.");
  if(newPassword===currentPassword)return fail(res,400,"Mật khẩu mới phải khác mật khẩu hiện tại.");
  const password=await bcrypt.hash(newPassword,12);
  const result=await Account.updateOne({_id:account._id,password:account.password},{$set:{password}});
  if(!result.matchedCount)return fail(res,409,"Mật khẩu đã thay đổi. Vui lòng thử lại.");
  res.json({message:"Đổi mật khẩu thành công!"});
};
exports.avatar=async(req,res)=>{
  if(!req.file)return fail(res,400,"Vui lòng chọn ảnh.");
  const image=await new Promise((resolve,reject)=>{
    const stream=cloudinary.uploader.upload_stream({folder:"thpt-practice/avatars",resource_type:"image",allowed_formats:["jpg","jpeg","png","webp","gif"],transformation:[{width:400,height:400,crop:"fill",gravity:"auto"}]},(error,result)=>error?reject(error):resolve(result));
    stream.end(req.file.buffer);
  });
  try{
    await Account.updateOne({_id:req.account._id},{$set:{avatarUrl:image.secure_url}});
  }catch(error){await cloudinary.uploader.destroy(image.public_id).catch(()=>{});throw error;}
  res.json({message:"Cập nhật ảnh đại diện thành công!"});
};
