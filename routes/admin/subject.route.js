// routes/client/auth.route.js
const express = require("express");
const router = express.Router();

const controller = require("../../controllers/admin/subject.controller");

router.get("/", controller.index); 
router.post("/create", controller.create); 
router.patch("/:id", controller.update); 
router.delete("/:id", controller.delete); 

module.exports = router;