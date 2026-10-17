const express = require("express");
const router = express.Router();

const dashboardController = require("../../controllers/admin/dashboard.controller");
const authMiddleware = require("../../middlewares/auth.middleware");

const authRoutes = require("./auth.route");
const subjectRoutes = require("./subject.route");
const topicRoutes = require("./topic.route");
const questionRoutes = require("./question.route");
const examRoutes = require("./exam.route");

// Đăng nhập, đăng ký không yêu cầu xác thực.
router.use("/auth", authRoutes);

// Các route bên dưới yêu cầu đăng nhập và quyền admin.
router.use(authMiddleware.requireAuth);
router.use(authMiddleware.requireAdmin);

router.get("/dashboard", dashboardController.dashboard);

router.use("/subjects", subjectRoutes);
router.use("/topics", topicRoutes);
router.use("/questions", questionRoutes);
router.use("/exams", examRoutes);

module.exports = router;