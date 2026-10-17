const express = require("express");
const router = express.Router();

const dashboardController = require("../../controllers/admin/dashboard.controller");
const authRoutes = require("./auth.route");
const authMiddleware = require("../../middlewares/admin/auth.middleware"); 
const subjectRoutes = require("./subject.route"); 
const topicRoutes = require("./topic.route"); 
const questionRoutes = require("./question.route"); 
const examRoutes = require("./exam.route"); 

router.use("/auth", authRoutes); 

router.use(authMiddleware.requireAdmin); 

router.get("/dashboard", dashboardController.dashboard);
  
router.use("/subjects", subjectRoutes);
router.use("/topics", topicRoutes); 
router.use("/questions", questionRoutes); 
router.use("/exams", examRoutes); 

module.exports = router;