const express = require("express");
const router = express.Router();

const examController = require("../../controllers/client/exam.controller");

router.get("/", examController.index);
router.get("/:id", examController.detail);       
router.post("/submit",examController.submit);          

router.get("/:attemptId/result", examController.result); 

module.exports = router;