const express = require("express");
const router = express.Router();

const controller = require("../../controllers/admin/question.controller");

router.get("/", controller.index);
router.post("/create", controller.create);
router.delete("/:id", controller.delete);
module.exports = router;