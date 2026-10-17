// routes/client/auth.route.js
const express = require("express");
const router = express.Router();

const controller = require("../../controllers/admin/auth.controller");

router.get("/login", controller.login); 
router.post("/login", controller.loginPost);

router.get("/register", controller.register);
router.post("/register", controller.registerPost); 
 
router.post("/logout", controller.logout);
module.exports = router;