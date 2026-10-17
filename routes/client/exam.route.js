const express = require("express");
const router = express.Router();

const examController = require("../../controllers/client/exam.controller");
const authMiddleware = require("../../middlewares/auth.middleware");

router.get("/", examController.index);
router.get("/:id", examController.detail);

router.use(authMiddleware.requireAuth);

router.post("/submit", examController.submit);
router.post("/:examId/start", examController.start);
router.get("/:attemptId/result", examController.result);

module.exports = router;