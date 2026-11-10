const router = require("express").Router();
const c = require("../../controllers/client/report.controller");
// Mounted after requireAuth + requireAdmin in the admin router.
router.get("/", c.list);
router.get("/:reportId", c.load, c.detail);
router.post("/:reportId", c.load, c.update);
router.use(c.error);
module.exports = router;
