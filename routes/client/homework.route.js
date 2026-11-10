const router = require("express").Router({ mergeParams: true });
const auth = require("../../middlewares/auth.middleware");
const taking = require("../../controllers/client/group-exam-taking.controller");
const c = require("../../controllers/client/homework.controller");
router.use(auth.requireAuth, taking.requireMember, c.context);
router.get("/", c.list);
router.post("/", c.owner, c.create);
router.get("/exams", c.owner, c.examChoices);
router.use("/:aid", c.load);
router.get("/:aid", c.detail);
router.post("/:aid/recipients", c.owner, c.recipients);
router.post("/:aid/extend", c.owner, c.extend);
router.post("/:aid/start", c.start);
router.get("/:aid/work", c.work);
router.get("/:aid/status", c.status);
router.post(["/:aid/save", "/:aid/submit"], c.write);
router.get("/:aid/result/:student", c.result);
router.use((error, req, res, next) => {
  if (!req.get("Accept")?.includes("application/json")) return next(error);
  console.error("Thao tác bài tập thất bại:", error);
  const invalid = error.name === "CastError" || error.name === "ValidationError";
  res.status(invalid ? 400 : 500).json({
    message: invalid ? "Dữ liệu không hợp lệ. Vui lòng kiểm tra lại." : "Thao tác thất bại. Vui lòng thử lại."
  });
});
module.exports = router;
