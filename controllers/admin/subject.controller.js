const Subject = require("../../models/subject.model");
const Topic = require("../../models/topic.model");

module.exports.index = async (req, res, next) => {
  try {
    const keyword = typeof req.query.keyword === "string"
      ? req.query.keyword.trim()
      : "";

    const status = ["active", "inactive"].includes(req.query.status)
      ? req.query.status
      : "all";

    const filter = {};

    // Tìm theo tên hoặc mã môn
    if (keyword) {
     const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      filter.$or = [
        { name: { $regex: escaped, $options: "i" } },
        { code: { $regex: escaped, $options: "i" } },
      ];
    }

    // Lọc trạng thái
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
      totalSubjects,
      activeSubjects,
      totalTopics,
    ] = await Promise.all([
      Subject.countDocuments(filter),
      Subject.countDocuments(),
      Subject.countDocuments({ active: true }),
      Topic.countDocuments(),
    ]);

    const totalPages = Math.max(1, Math.ceil(totalItems / limit));

    currentPage = Math.min(currentPage, totalPages);

    const skip = (currentPage - 1) * limit;

    const subjects = await Subject.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const topicCounts = await Topic.aggregate([
      {
        $match: {
          subjectId: { $in: subjects.map(subject => subject._id) },
        },
      },
      {
        $group: {
          _id: "$subjectId",
          count: { $sum: 1 },
        },
      },
    ]);

    const countMap = new Map(
      topicCounts.map(item => [item._id.toString(), item.count])
    );

    subjects.forEach(subject => {
      subject.topicCount = countMap.get(subject._id.toString()) || 0;
    });

    // Giữ từ khóa và trạng thái khi chuyển trang
    const pageUrl = page => {
      const params = new URLSearchParams({
        keyword,
        status,
        page: String(page),
      });

      return `/admin/subjects?${params.toString()}`;
    };

    res.render("admin/subjects", {
      title: "Quản lý môn học",
      activePage: "subjects",
      subjects,
      keyword,
      status,
      totalSubjects,
      activeSubjects,
      totalItems,
      currentPage,
      totalPages, 
      totalTopics,
      startItem: totalItems ? skip + 1 : 0,
      endItem: skip + subjects.length,
      pageUrl,
    });
  } catch (error) {
    next(error);
  }
}; 

module.exports.create = async (req, res, next) => {
  try { 
    const {name, code , description , active} = req.body; 

    if (await Subject.findOne({ code,name })) {
      return res.json({ code: "error", message: 'Môn học đã tồn tại!' });
    } 

    await Subject.create({ name, code, description, active }); 
    res.json({ code: "success", message: 'Tạo môn học thành công!' }); 

  } catch (error) {
    res.json({ code: "error", message: 'Tạo môn học thất bại!' });
  }
} 

module.exports.update = async (req, res, next) => {
  try { 
    const {name, code , description , active} = req.body; 
    await Subject.updateOne({ _id: req.params.id }, { name, code, description, active }); 
    res.json({ code: "success", message: 'Cập nhật môn học thành công!' }); 

  } catch (error) {
    res.json({ code: "error", message: 'Cập nhật môn học thất bại!' });
  }
} 

module.exports.delete = async (req, res, next) => {
  try { 
    const id = req.params.id; 
    const existTopic = await Topic.findOne({ subjectId: id }); 
    if (existTopic) {
      return res.json({ code: "error", message: 'Xóa môn học thất bại! Vui lòng xóa các Topic liên quan trước!' }); 
    } 

    await Subject.deleteOne({ _id: req.params.id }); 
    res.json({ code: "success", message: 'Xóa môn học thành công!' }); 
  } catch (error) {
    res.json({ code: "error", message: 'Xóa môn học thất bại!' });
  }
}