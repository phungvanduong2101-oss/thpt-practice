const { test } = require('node:test');
const assert = require('node:assert/strict');
const Comment = require('../models/exam-comment.model');
const c = require('../controllers/client/exam-discussion.controller');
const id = '111111111111111111111111';
const examId = '222222222222222222222222';
function query(value, sorts) {
  return { sort(order) { sorts?.push(order); return this; }, skip() { return this; }, limit() { return this; }, populate() { return this; }, select() { return this; }, lean: async () => value };
}
test('Thảo luận đề hệ thống và trong nhóm đều cũ nhất trước, tie-break bằng _id', async t => {
  const sorts = [];
  t.mock.method(Comment, 'countDocuments', async () => 0);
  t.mock.method(Comment, 'find', () => query([], sorts));
  for (const group of [null, { _id: id }]) {
    await c.page({ query: {}, commentFilter: { examId, groupId: group?._id || null }, discussionExam: { title: 'Đề' }, discussionUrl: '/exams/' + examId, group }, { render: (view, data) => assert.equal(data.page, 1) });
  }
  assert.deepEqual(sorts, [{ createdAt: 1, _id: 1 }, { createdAt: 1, _id: 1 }]);
});
test('Link thông báo định vị đúng trang thứ ba, kể cả các bình luận cùng thời điểm', async t => {
  const at = new Date(), comment = { _id: id, createdAt: at };
  t.mock.method(Comment, 'findOne', () => query(comment));
  t.mock.method(Comment, 'countDocuments', async filter => {
    assert.deepEqual(filter.$or, [{ createdAt: { $lt: at } }, { createdAt: at, _id: { $lt: id } }]);
    assert.equal(filter.groupId, examId); return 30;
  });
  await c.locate({ params: { commentId: id }, commentFilter: { examId, groupId: examId }, discussionUrl: '/groups/' + examId + '/exams/' + examId }, {
    redirect: url => assert.equal(url, '/groups/' + examId + '/exams/' + examId + '?page=3#exam-comment-' + id),
  });
});
test('Gửi mới trả đường dẫn định vị để AJAX mở đúng trang chứa bình luận mới', async t => {
  t.mock.method(Comment, 'create', async data => { assert.equal(data.content, 'Bình luận mới'); return { _id: id }; });
  await c.create({ body: { content: 'Bình luận mới' }, account: { _id: examId }, commentFilter: { examId, groupId: null }, discussionUrl: '/exams/' + examId }, {
    json: result => { assert.equal(result.commentId, id); assert.equal(result.redirectUrl, '/exams/' + examId + '/comments/' + id); },
  });
});
