const express = require("express");
const router = express.Router();

const homeController = require("../../controllers/client/home.controller");
const authRoutes = require("./auth.route"); 
const authMiddleware = require("../../middlewares/client/auth.middleware"); 
const examRoute = require("./exam.route"); 

router.use(authMiddleware.optionalAuth);
router.get("/", homeController.index); 

router.use("/auth", authRoutes); 
router.use("/exams", examRoute); 

module.exports = router;