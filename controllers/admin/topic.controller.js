const Topic = require("../../models/topic.model");
 

const mongoose = require("mongoose");
const Subject = require("../../models/subject.model");

module.exports.index = async (req, res, next) => {
  try {
    const keyword = typeof req.query.keyword === "string"
      ? req.query.keyword.trim()
      : "";

    const status = ["active", "inactive"].includes(req.query.status)
      ? req.query.status
      : "all";

    const subjectId =
      typeof req.query.subjectId === "string" &&
      mongoose.isObjectIdOrHexString(req.query.subjectId)
        ? req.query.subjectId
        : "all";

    const filter = {};

    // Tìm kiếm tên hoặc mã chuyên đề
    if (keyword) {
      const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      filter.$or = [
        { name: { $regex: escaped, $options: "i" } },
        { code: { $regex: escaped, $options: "i" } },
      ];
    }

    // Lọc theo môn học
    if (subjectId !== "all") {
      filter.subjectId = subjectId;
    }

    // Lọc theo trạng thái
    if (status !== "all") {
      filter.active = status === "active";
    }

    const limit = 6;
    const requestedPage = Number(req.query.page);

    let currentPage =
      Number.isSafeInteger(requestedPage) && requestedPage > 0
        ? requestedPage
        : 1;

    const [
      totalItems,
      totalTopics,
      activeTopics,
      topicSubjectIds,
      subjects,
    ] = await Promise.all([
      Topic.countDocuments(filter),
      Topic.countDocuments(),
      Topic.countDocuments({ active: true }),
      Topic.distinct("subjectId"),
      Subject.find()
        .select("name code active")
        .sort({ name: 1 })
        .lean(),
    ]);

    // Chỉ đếm các môn học vẫn còn tồn tại
    const subjectsWithTopics = subjects.filter(subject =>
      topicSubjectIds.some(id => String(id) === String(subject._id))
    ).length;

    const totalPages = Math.max(1, Math.ceil(totalItems / limit));

    currentPage = Math.min(currentPage, totalPages);

    const skip = (currentPage - 1) * limit;

    const topics = await Topic.find(filter)
      .populate("subjectId", "name code active")
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Giữ bộ lọc khi chuyển trang
    const pageUrl = page => {
      const params = new URLSearchParams({
        keyword,
        subjectId,
        status,
        page: String(page),
      });

      return `/admin/topics?${params.toString()}`;
    };

    res.render("admin/topics", {
      title: "Quản lý chuyên đề",
      activePage: "topics",
      topics,
      subjects,
      keyword,
      subjectId,
      status,
      totalTopics,
      activeTopics,
      subjectsWithTopics,
      totalItems,
      currentPage,
      totalPages,
      startItem: totalItems ? skip + 1 : 0,
      endItem: skip + topics.length,
      pageUrl,
    });
  } catch (error) {
    next(error);
  }
}; 

module.exports.create = async (req, res, next) => {
    try {  
        const {subjectId, name, code, description, active} = req.body;  

        const existSubject = await Subject.findById(subjectId); 
        if(!existSubject || !existSubject.active) {
            return res.json({ code: "error", message: 'Môn học không ttoonf tại hoặc đã bị ẩn!' });
        } 
         
        const existTopic = await Topic.findOne({subjectId, code}); 
        if(existTopic) {
            return res.json({ code: "error", message: 'Mã chuyên đề tồn tại!' });
        }
        await Topic.create({subjectId, name, code, description, active}); 
        res.json({ code: "success", message: 'Tạo chuyên đề thành công!' });

    } catch(error) {
        res.json({ code: "error", message: 'Tạo chuyên đề thất bại!' });
    }
}
 
module.exports.update = async (req, res, next) => {
    try { 
       const {subjectId, name, code, description, active} = req.body; 
       const existSubject = await Subject.findById(subjectId); 
       if(!existSubject || !existSubject.active) {
           return res.json({ code: "error", message: 'Môn học không tồn tại hoặc đã bị ẩn!' });
       }  
       const existTopic = await Topic.findOne({_id: req.params.id}); 
       if(!existTopic) {
           return res.json({ code: "error", message: 'Chuyên đề khöng tồn tại!' });
       }
        await Topic.updateOne({ _id: req.params.id }, { subjectId, name, code, description, active }); 
        res.json({ code: "success", message: 'Cập nhật chuyên đề thành công!' });
    } catch(error) {
        res.json({ code: "error", message: 'Cập nhật chuyên đề thất bại!' });
    }
} 

module.exports.delete = async (req, res, next) => {
    try { 

    } catch(error) {
        res.json({ code: "error", message: 'Xóa chuyên đề thất bại!' });
    }
}