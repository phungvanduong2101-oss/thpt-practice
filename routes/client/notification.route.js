const express = require("express");
const router = express.Router();

const controller = require("../../controllers/client/notification.controller");
const authMiddleware = require("../../middlewares/auth.middleware");

router.use(authMiddleware.requireAuth);

router.get("/", controller.index);
router.patch("/:id/read", controller.read);

module.exports = router;