const router = require("express").Router();
const controller = require("../../controllers/admin/user.controller");

// Được mount sau requireAuth và requireAdmin trong index.route.js.
router.get("/", controller.index);
router.patch("/:id/status", controller.status);
router.patch("/:id", controller.update);
module.exports = router;
