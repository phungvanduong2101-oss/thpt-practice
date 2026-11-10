const express = require("express");
const router = express.Router();

const examController = require("../../controllers/client/exam.controller");
const authMiddleware = require("../../middlewares/auth.middleware");

router.get("/", examController.index);
const discussion=require("../../controllers/client/exam-discussion.controller");
router.get("/:id", discussion.load, discussion.page);
router.get("/:id/comments/:commentId",discussion.load,discussion.locate);
router.get("/:id/take", examController.detail);
router.post("/:id/comments",authMiddleware.requireAuth,discussion.load,discussion.create);
router.post("/:id/comments/:commentId/edit",authMiddleware.requireAuth,discussion.load,discussion.change);
router.post("/:id/comments/:commentId/delete",authMiddleware.requireAuth,discussion.load,discussion.change);

router.use(authMiddleware.requireAuth);

router.post("/submit", examController.submit);
router.post("/:examId/start", examController.start);
router.get("/:attemptId/result", examController.result);

module.exports = router;