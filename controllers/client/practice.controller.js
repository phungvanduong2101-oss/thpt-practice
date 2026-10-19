const mongoose = require('mongoose');
const Subject = require('../../models/subject.model');
const Topic = require('../../models/topic.model');
const Question = require('../../models/question.model');
const Attempt = require('../../models/attempt.model');

module.exports.index = async (req, res, next) => {
  try {
    const [subjects, topics] = await Promise.all([
      Subject.find({ active: true }).select('name').sort({ name: 1 }).lean(),
      Topic.find({ active: true }).select('name subjectId').sort({ name: 1 }).lean(),
    ]);
    res.render('client/practice', { title: 'Luyện tập', activePage: 'practice', subjects, topics });
  } catch (error) { next(error); }
};

module.exports.create = async (req, res, next) => {
  try {
    const { subjectId, topicId = 'all', count } = req.body || {};
    const size = Number(count);
    const reject = message => res.status(400).json({ code: 'error', message });
    if (!mongoose.isObjectIdOrHexString(subjectId)) return reject('Vui lòng chọn môn học hợp lệ.');
    if (!Number.isInteger(size) || size < 1 || size > 100) return reject('Số câu phải là số nguyên từ 1 đến 100.');
    const subject = await Subject.findOne({ _id: subjectId, active: true }).lean();
    if (!subject) return reject('Môn học không còn hoạt động.');
    const topicFilter = { subjectId: subject._id, active: true };
    if (topicId !== 'all') {
      if (!mongoose.isObjectIdOrHexString(topicId)) return reject('Chuyên đề không hợp lệ.');
      topicFilter._id = topicId;
    }
    const topics = await Topic.find(topicFilter).select('_id name').lean();
    if (topicId !== 'all' && !topics.length) return reject('Chuyên đề không thuộc môn đã chọn hoặc đã bị ẩn.');
    const questions = await Question.aggregate([
      { $match: { scope: 'system', published: true, subjectId: subject._id, topicId: { $in: topics.map(t => t._id) } } },
      { $sample: { size } },
    ]);
    if (questions.length < size) {
      return reject(`Không đủ câu hỏi: hiện có ${questions.length} câu phù hợp, bạn yêu cầu ${size} câu. Vui lòng giảm số câu hoặc chọn tất cả chuyên đề.`);
    }
    const topicName = topicId === 'all' ? 'Tất cả chuyên đề' : topics[0].name;
    const attempt = await Attempt.create({
      accountId: req.account._id, kind: 'practice', status: 'ready',
      subjectId: subject._id, examTitle: `Luyện tập ${subject.name} · ${topicName}`,
      duration: size * 2, totalQuestions: size, maxScore: 10,
      questions: questions.map(q => ({
        questionId: q._id, type: q.type, content: q.content, contentText: q.contentText,
        options: q.options, correctAnswer: q.correctAnswer, acceptedAnswers: q.acceptedAnswers, explanation: q.explanation,
      })),
    });
    res.status(201).json({ code: 'success', url: `/practice/${attempt._id}` });
  } catch (error) {
    if (error.name === 'CastError') return res.status(400).json({ code: 'error', message: 'Dữ liệu không hợp lệ.' });
    next(error);
  }
};

module.exports.detail = async (req, res, next) => {
  try {
    if (!mongoose.isObjectIdOrHexString(req.params.attemptId)) return res.sendStatus(404);
    const attempt = await Attempt.findOne({ _id: req.params.attemptId, accountId: req.account._id, kind: 'practice', status: 'ready' })
      .populate('subjectId', 'name').lean();
    if (!attempt) return res.status(404).send('Lượt luyện tập đã bắt đầu, đã nộp hoặc không thuộc bạn. Vào /practice để tạo lượt mới.');
    res.render('client/exam-taking', {
      title: attempt.examTitle, activePage: 'practice', listUrl: '/practice',
      startUrl: `/practice/${attempt._id}/start`,
      exam: { _id: attempt._id, title: attempt.examTitle, subjectId: attempt.subjectId, duration: attempt.duration,
        description: 'Luyện tập ngẫu nhiên · thời gian mặc định 2 phút/câu. Nhấn Bắt đầu để tính giờ.' },
      questions: attempt.questions.map(q => ({
        _id: q.questionId, type: q.type, content: q.content, contentText: q.contentText,
        options: q.options.map(o => ({ key: o.key, content: o.content })),
      })),
    });
  } catch (error) { next(error); }
};

module.exports.start = async (req, res, next) => {
  try {
    if (!mongoose.isObjectIdOrHexString(req.params.attemptId)) return res.sendStatus(404);
    const attempt = await Attempt.findOneAndUpdate(
      { _id: req.params.attemptId, accountId: req.account._id, kind: 'practice', status: 'ready' },
      { $set: { status: 'in_progress', startedAt: new Date() } },
      { new: true, runValidators: true }
    ).select('_id');
    if (!attempt) return res.status(409).json({ code: 'error', message: 'Lượt luyện tập đã bắt đầu hoặc không còn khả dụng.' });
    res.json({ code: 'success', message: 'Nhấn OK để bắt đầu luyện tập.', attemptId: attempt._id });
  } catch (error) { next(error); }
};
