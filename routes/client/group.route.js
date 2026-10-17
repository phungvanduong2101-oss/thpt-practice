const express = require("express");
const router = express.Router();

const groupController = require("../../controllers/client/group.controller");
const authMiddleware = require("../../middlewares/auth.middleware");

router.get("/", groupController.index);

router.get(
  "/create",
  authMiddleware.requireAuth,
  groupController.create
);

router.post(
  "/create",
  authMiddleware.requireAuth,
  groupController.createPost
);

router.get(
  "/:id/manage",
  authMiddleware.requireAuth,
  groupController.manage
);

router.post(
  "/:id/members/:accountId/approve",
  authMiddleware.requireAuth,
  groupController.approveMember
);

router.post(
  "/:id/members/:accountId/reject",
  authMiddleware.requireAuth,
  groupController.rejectMember
);

router.post(
  "/:id/members/:accountId/remove",
  authMiddleware.requireAuth,
  groupController.removeMember
);

router.post(
  "/:id/join",
  authMiddleware.requireAuth,
  groupController.join
);

router.post(
  "/:id/cancel-join",
  authMiddleware.requireAuth,
  groupController.cancelJoin
);

router.get("/:id", groupController.detail);

module.exports = router;