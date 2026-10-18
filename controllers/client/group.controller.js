const Group = require("../../models/group.model");
const notificationService = require("../../services/notification.service");
module.exports.index = async (req, res, next) => {
  try {
    let keyword = "";
    let status = "";
    let acceptingMembers = "";

    if (typeof req.query.keyword === "string") {
      keyword = req.query.keyword.trim();
    }

    if (req.query.status === "active") {
      status = "active";
    }

    if (req.query.status === "inactive") {
      status = "inactive";
    }

    if (req.query.acceptingMembers === "true") {
      acceptingMembers = "true";
    }

    if (req.query.acceptingMembers === "false") {
      acceptingMembers = "false";
    }



    const filter = {};

    if (keyword) {
      const escapedKeyword = keyword.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      );

      filter.name = {
        $regex: escapedKeyword,
        $options: "i",
      };
    }


    if (status) {
      filter.status = status;
    }

    if (acceptingMembers === "true") {
      filter.acceptingMembers = true;
    }

    if (acceptingMembers === "false") {
      filter.acceptingMembers = false;
    }

    const limit = 10;
    let currentPage = Number(req.query.page);

    if (!Number.isSafeInteger(currentPage) || currentPage < 1) {
      currentPage = 1;
    }

    const totalItems = await Group.countDocuments(filter);

    let totalPages = Math.ceil(totalItems / limit);

    if (totalPages < 1) {
      totalPages = 1;
    }

    if (currentPage > totalPages) {
      currentPage = totalPages;
    }

    const skip = (currentPage - 1) * limit;

    const groups = await Group.find(filter)
      .select(
        "name description  ownerId memberIds status acceptingMembers"
      )
      .populate("ownerId", "fullName")
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    let startItem = 0;
    let endItem = 0;

    if (totalItems > 0) {
      startItem = skip + 1;
      endItem = skip + groups.length;
    }

    return res.render("client/groups", {
      title: "Khám phá nhóm học tập",
      activePage: "groups",

      groups,

      keyword,
      status,
      acceptingMembers,

      totalItems,
      currentPage,
      totalPages,
      startItem,
      endItem,
    });
  } catch (error) {
    return next(error);
  }
};

module.exports.create = async (req, res, next) => {
  try {


    return res.render("client/group-create", {
      title: "Tạo nhóm học tập",
      activePage: "groups",
      error: "",
      formData: {
        name: "",
        description: "",
        acceptingMembers: true,
      },
    });
  } catch (error) {
    return next(error);
  }
};

module.exports.createPost = async (req, res, next) => {
  try {
    const formData = {
      name: "",
      description: "",
      acceptingMembers: false,
    };

    if (typeof req.body.name === "string") {
      formData.name = req.body.name.trim();
    }

    if (typeof req.body.description === "string") {
      formData.description = req.body.description.trim();
    }

    if (req.body.acceptingMembers === "true") {
      formData.acceptingMembers = true;
    }



    let error = "";

    if (!formData.name || formData.name.length > 100) {
      error = "Tên nhóm phải có từ 1 đến 100 ký tự.";
    } else if (formData.description.length > 1000) {
      error = "Mô tả không được vượt quá 1.000 ký tự.";
    }

    if (error) {
      return res.status(400).render("client/group-create", {
        title: "Tạo nhóm học tập",
        activePage: "groups",
        error,
        formData,
      });
    }

    await Group.create({
      name: formData.name,
      description: formData.description,
      acceptingMembers: formData.acceptingMembers,

      ownerId: req.account._id,
      memberIds: [req.account._id],
      pendingMemberIds: [],
      status: "active",
    });

    return res.redirect(303, "/groups");
  } catch (error) {
    return next(error);
  }
};

module.exports.edit = async (req, res, next) => {
  try {

    const { id } = req.params;
    const existingGroup = await Group.findById(id).lean();

    if (!existingGroup) {
      return res.status(404).send("Không tìm thấy nhóm.");
    }
    if (String(existingGroup.ownerId) !== String(req.account._id)) {
      return res.status(403).send("Bạn không có quyền quản lý nhóm.");
    }


    return res.render("client/group-edit", {
      title: "Tạo nhóm học tập",
      activePage: "groups",
      error: "",
      formData: {
        name: existingGroup.name,
        description: existingGroup.description,
        acceptingMembers: existingGroup.acceptingMembers,
      },
      groupId: existingGroup._id
    });
  } catch (error) {
    return next(error);
  }
};

module.exports.editPatch = async (req, res, next) => {  
  try {
    const { id } = req.params;
    const existingGroup = await Group.findById(id).lean();
    if (!existingGroup) {
      return res.status(404).send("Không tìm thấy nhóm.");
    }
    if (String(existingGroup.ownerId) !== String(req.account._id)) {
      return res.status(403).send("Bạn không có quyền quản lý nhóm.");
    }

    existingGroup.name = req.body.name;
    existingGroup.description = req.body.description;
    existingGroup.acceptingMembers = req.body.acceptingMembers;

    await Group.findByIdAndUpdate(existingGroup._id, existingGroup);
    return res.redirect(
      `/groups/${req.params.id}?message=${encodeURIComponent("Cập nhật nhóm thành công!")}`
    );
  } catch (error) {
    return next(error);
  }
}
module.exports.detail = async (req, res, next) => {
  try {
    const group = await Group.findById(req.params.id)
      .populate("ownerId", "fullName")
      .lean();

    if (!group) {
      return res.status(404).send("Không tìm thấy nhóm.");
    }

    let isOwner = false;
    let isMember = false;
    let isPending = false;

    if (req.account) {
      const accountId = String(req.account._id);

      if (
        group.ownerId &&
        String(group.ownerId._id) === accountId
      ) {
        isOwner = true;
      }

      isMember = group.memberIds.some(id => {
        return String(id) === accountId;
      });

      isPending = group.pendingMemberIds.some(id => {
        return String(id) === accountId;
      });
    }

    let message = "";

    if (req.query.notice === "requested") {
      message = "Đã gửi yêu cầu tham gia. Vui lòng chờ trưởng nhóm duyệt.";
    }

    if (req.query.notice === "cancelled") {
      message = "Đã hủy yêu cầu tham gia.";
    }

    return res.render("client/group-detail", {
      title: group.name,
      activePage: "groups",
      group,
      isOwner,
      isMember,
      isPending,
      message,
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(404).send("Không tìm thấy nhóm.");
    }

    return next(error);
  }
};

module.exports.join = async (req, res, next) => {
  try {
    const accountId = req.account._id;
    const groupId = req.params.id;

    const group = await Group.findOneAndUpdate(
      {
        _id: groupId,
        status: "active",
        acceptingMembers: true,
        ownerId: { $ne: accountId },
        memberIds: { $ne: accountId },
        pendingMemberIds: { $ne: accountId },
      },
      {
        $addToSet: {
          pendingMemberIds: accountId,
        },
      },
      { new: true }
    ).select("_id ownerId name");

    if (!group) {
      const existingGroup = await Group.findById(groupId)
        .select("_id")
        .lean();

      if (!existingGroup) {
        return res.status(404).send("Không tìm thấy nhóm.");
      }

      return res.status(409).send(
        "Không thể gửi yêu cầu. Nhóm đã đóng, bạn đã tham gia hoặc đang chờ duyệt."
      );
    }

    // Yêu cầu đã lưu thành công; lỗi thông báo không làm hỏng luồng này.
    try {
      let senderName = req.account.fullName;

      if (!senderName) {
        senderName = "Một người dùng";
      }

      await notificationService.send(req.app.get("io"), {
        recipientId: group.ownerId,
        senderId: accountId,
        type: "group_join_request",
        content: `${senderName} muốn tham gia nhóm "${group.name}".`,
        link: `/groups/${group._id}/manage`,
      });
    } catch (error) {
      console.error("Không gửi được thông báo xin vào nhóm:", error);
    }

    return res.redirect(
      303,
      `/groups/${group._id}?notice=requested`
    );
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(404).send("Không tìm thấy nhóm.");
    }

    return next(error);
  }
};

module.exports.cancelJoin = async (req, res, next) => {
  try {
    const group = await Group.findByIdAndUpdate(
      req.params.id,
      {
        $pull: {
          pendingMemberIds: req.account._id,
        },
      },
      { new: true }
    ).select("_id");

    if (!group) {
      return res.status(404).send("Không tìm thấy nhóm.");
    }

    return res.redirect(
      303,
      `/groups/${group._id}?notice=cancelled`
    );
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(404).send("Không tìm thấy nhóm.");
    }

    return next(error);
  }
};

module.exports.manage = async (req, res, next) => {
  try {
    const group = await Group.findById(req.params.id)
      .populate("memberIds", "fullName")
      .populate("pendingMemberIds", "fullName")
      .lean();

    if (!group) {
      return res.status(404).send("Không tìm thấy nhóm.");
    }

    if (String(group.ownerId) !== String(req.account._id)) {
      return res.status(403).send("Bạn không có quyền quản lý nhóm.");
    }

    let message = "";

    if (req.query.notice === "approved") {
      message = "Đã duyệt thành viên.";
    }

    if (req.query.notice === "rejected") {
      message = "Đã từ chối yêu cầu.";
    }

    if (req.query.notice === "removed") {
      message = "Đã xóa thành viên khỏi nhóm.";
    }

    return res.render("client/group-manage", {
      title: "Quản lý thành viên",
      activePage: "groups",
      group,
      message,
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(404).send("Không tìm thấy nhóm.");
    }

    return next(error);
  }
};

module.exports.approveMember = async (req, res, next) => {
  try {
    const { id, accountId } = req.params;

    const group = await Group.findOneAndUpdate(
      {
        _id: id,
        ownerId: req.account._id,
        status: "active",
        pendingMemberIds: accountId,
      },
      {
        $addToSet: {
          memberIds: accountId,
        },
        $pull: {
          pendingMemberIds: accountId,
        },
      },
      { new: true }
    ).select("_id name");

    if (!group) {
      return res.status(409).send(
        "Không thể duyệt. Kiểm tra quyền quản lý, trạng thái nhóm hoặc yêu cầu đã bị hủy."
      );
    }

    try {
      await notificationService.send(req.app.get("io"), {
        recipientId: accountId,
        senderId: req.account._id,
        type: "group_join_approved",
        content: `Bạn đã được duyệt tham gia nhóm "${group.name}".`,
        link: `/groups/${group._id}`,
      });
    } catch (error) {
      console.error("Không gửi được thông báo duyệt thành viên:", error);
    }

    return res.redirect(
      303,
      `/groups/${group._id}/manage?notice=approved`
    );
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).send(
        "ID nhóm hoặc tài khoản không hợp lệ."
      );
    }

    return next(error);
  }
};

module.exports.rejectMember = async (req, res, next) => {
  try {
    const { id, accountId } = req.params;

    const group = await Group.findOneAndUpdate(
      {
        _id: id,
        ownerId: req.account._id,
        pendingMemberIds: accountId,
      },
      {
        $pull: {
          pendingMemberIds: accountId,
        },
      },
      { new: true }
    ).select("_id");

    if (!group) {
      return res.status(409).send(
        "Không thể từ chối. Bạn không có quyền hoặc yêu cầu không còn tồn tại."
      );
    }

    return res.redirect(
      303,
      `/groups/${group._id}/manage?notice=rejected`
    );
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).send("ID nhóm hoặc tài khoản không hợp lệ.");
    }

    return next(error);
  }
};

module.exports.removeMember = async (req, res, next) => {
  try {
    const { id, accountId } = req.params;

    if (String(accountId) === String(req.account._id)) {
      return res.status(400).send("Không thể xóa trưởng nhóm.");
    }

    const group = await Group.findOneAndUpdate(
      {
        _id: id,
        ownerId: req.account._id,
        memberIds: accountId,
      },
      {
        $pull: {
          memberIds: accountId,
          pendingMemberIds: accountId,
        },
      },
      { new: true }
    ).select("_id");

    if (!group) {
      return res.status(409).send(
        "Không thể xóa. Bạn không có quyền hoặc thành viên không còn trong nhóm."
      );
    }

    return res.redirect(
      303,
      `/groups/${group._id}/manage?notice=removed`
    );
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).send("ID nhóm hoặc tài khoản không hợp lệ.");
    }

    return next(error);
  }
};