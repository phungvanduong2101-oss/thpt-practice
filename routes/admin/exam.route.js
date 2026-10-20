const express = require("express");
const router = express.Router();

const controller = require("../../controllers/admin/exam.controller");

router.get("/", controller.index);
router.post("/create", controller.create);
router.patch("/:id", controller.update); 
router.delete("/:id", controller.delete);
module.exports = router;