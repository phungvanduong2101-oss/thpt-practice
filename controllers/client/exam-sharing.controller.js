const mongoose = require('mongoose');
const Group = require('../../models/group.model');
const Exam = require('../../models/exam.model');
const notifications = require('../../services/notification.service');

module.exports.requireOwner = async (req, res, next) => {
  try {
    if (!mongoose.isObjectIdOrHexString(req.params.id)) return res.sendStatus(404);
    const group = await Group.findOne({ _id: req.params.id, ownerId: req.account._id }).lean();
    if (!group) return res.status(403).send('Chỉ trưởng nhóm được quản lý chia sẻ đề.');
    req.group = group;
    next();
  } catch (error) { next(error); }
};

module.exports.index = async (req, res, next) => {
  try {
    const [shared, available] = await Promise.all([
      Exam.find({ groupIds: req.group._id, scope: 'personal' }).select('title status createdBy').sort({ createdAt: -1 }).lean(),
      Exam.find({ createdBy: req.account._id, scope: 'personal', status: 'published', groupIds: { $ne: req.group._id } }).select('title status').sort({ createdAt: -1 }).lean(),
    ]);
    res.render('client/group-exam-sharing', { title: 'Chia sẻ đề thi', activePage: 'groups', group: req.group, shared, available });
  } catch (error) { next(error); }
};

module.exports.share = async (req, res, next) => {
  try {
    if (!mongoose.isObjectIdOrHexString(req.body.examId)) return res.status(400).send('Đề thi không hợp lệ.');
    if (req.group.status !== 'active') return res.status(403).send('Nhóm đang ngừng hoạt động.');
    const exam = await Exam.findOneAndUpdate(
      { _id: req.body.examId, createdBy: req.account._id, scope: 'personal', status: 'published', groupIds: { $ne: req.group._id } },
      { $addToSet: { groupIds: req.group._id } },
      { new: true }
    ).lean();
    if (!exam) return res.status(409).send('Đề không thuộc bạn, chưa xuất bản hoặc đã được chia sẻ.');

    const io = req.app.get('io');
    if (io) {
      const recipients = [...new Set(req.group.memberIds.map(String))]
        .filter(id => id !== String(req.account._id));
      const results = await Promise.allSettled(recipients.map(recipientId => notifications.send(io, {
        recipientId, senderId: req.account._id, type: 'group_exam_published',
        content: `Nhóm ${req.group.name} có đề mới: ${exam.title}`.slice(0, 500),
        link: `/groups/${req.group._id}/exams`,
      })));
      for (const result of results) if (result.status === 'rejected') console.error('Không gửi được thông báo chia sẻ đề:', result.reason);
    }
    res.redirect(`/groups/${req.group._id}/exams/manage`);
  } catch (error) { next(error); }
};

module.exports.unshare = async (req, res, next) => {
  try {
    if (!mongoose.isObjectIdOrHexString(req.params.examId)) return res.status(400).send('Đề thi không hợp lệ.');
    await Exam.updateOne(
      { _id: req.params.examId, groupIds: req.group._id, scope: 'personal' },
      { $pull: { groupIds: req.group._id } }
    );
    res.redirect(`/groups/${req.group._id}/exams/manage`);
  } catch (error) { next(error); }
};
