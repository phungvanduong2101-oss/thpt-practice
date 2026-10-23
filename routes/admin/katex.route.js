const express = require("express");
const router = express.Router();
 
const controller = require("../../controllers/admin/latex.controller"); 

router.get("/", controller.index);
router.get("/create", controller.create); 
router.post("/create", controller.createPost); 
router.get("/:id/edit", controller.edit);  
router.patch("/:id/edit", controller.editPatch); 
router.delete("/:id/delete", controller.delete); 

module.exports = router;