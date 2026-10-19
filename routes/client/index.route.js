const express = require("express");
const router = express.Router();

const homeController = require("../../controllers/client/home.controller");
const attemptController = require("../../controllers/client/attempt.controller");

const authMiddleware = require("../../middlewares/auth.middleware");

const authRoutes = require("./auth.route");
const examRoute = require("./exam.route");
const groupRoutes = require("./group.route"); 
const notificationRoutes = require("./notification.route"); 

router.get("/", homeController.index);

router.get(
  "/attempts",
  authMiddleware.requireAuth,
  attemptController.index
);

router.use("/auth", authRoutes);
router.use("/exams", examRoute);
router.use("/groups", groupRoutes);  
router.use("/notifications", notificationRoutes);    
router.use('/my/questions', require('./personal-question.route'));
router.use('/my/exams', require('./personal-exam.route')); 
router.use("/practice", require("./practice.route"));
module.exports = router;