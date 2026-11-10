const router = require("express").Router({ mergeParams: true });
const auth = require("../../middlewares/auth.middleware");
const taking = require("../../controllers/client/group-exam-taking.controller");
const c = require("../../controllers/client/post.controller");
router.use(auth.requireAuth, taking.requireMember);
router.use((req, res, next) => {
  res.set("Cache-Control", "private, no-store");
  next();
});
router.post("/images", (req,res,next)=>{
  require("../../middlewares/upload-image.middleware").single("image")(req,res,error=>{
    if(error)return res.status(400).json({message:error.code==="LIMIT_FILE_SIZE"?"Ảnh tối đa 3 MB.":error.message});
    next();
  });
}, c.upload);
router.get("/", c.list);
router.post("/", c.create);
router.use("/:postId", c.load);
router.get("/:postId", c.detail);
router.post("/:postId/edit", c.edit);
router.post("/:postId/delete", c.remove);
router.post("/:postId/comments", c.comment);
router.get("/:postId/comments/:commentId", c.locate);
router.post("/:postId/comments/:commentId/edit", c.changeComment);
router.post("/:postId/comments/:commentId/delete", c.changeComment);
router.use((error, req, res, next) => {
  console.error("Thảo luận nhóm:", error);
  res.status(500).json({ message: "Thao tác thất bại. Vui lòng thử lại." });
});
module.exports = router;
