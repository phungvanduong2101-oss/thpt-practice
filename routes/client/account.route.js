const router=require("express").Router();
const auth=require("../../middlewares/auth.middleware");
const c=require("../../controllers/client/account.controller");
router.use(auth.requireAuth,(req,res,next)=>{res.set("Cache-Control","private, no-store");next();});
router.get("/",c.page);
router.post("/profile",c.profile);
router.post("/email",c.email);
router.post("/password",c.password);
router.post("/avatar",(req,res,next)=>{
  require("../../middlewares/upload-image.middleware").single("image")(req,res,error=>{
    if(error)return res.status(400).json({message:error.code==="LIMIT_FILE_SIZE"?"Ảnh tối đa 3 MB.":error.message});
    next();
  });
},c.avatar);
router.use((error,req,res,next)=>{console.error("Cập nhật tài khoản:",error);res.status(500).json({message:"Cập nhật thất bại. Vui lòng thử lại."});});
module.exports=router;
