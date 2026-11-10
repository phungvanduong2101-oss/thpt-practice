const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Types } = require('mongoose');
const { listExams, titlePattern } = require('../services/homework-exams');
const { initHomeworkExamPicker } = require('../public/client/js/homework-exam-picker');

const owner = new Types.ObjectId();
function model(total) {
  const calls = {};
  return { calls, async countDocuments(filter) { calls.filter = filter; return total; },
    async aggregate(pipeline) {
      calls.pipeline = pipeline;
      const skip = pipeline.find(s => '$skip' in s).$skip;
      const limit = pipeline.find(s => '$limit' in s).$limit;
      return Array.from({ length: Math.max(0, Math.min(limit, total - skip)) }, (_, i) => ({ _id: String(i + skip), title: 'Đề ' + i, questionCount: 20 }));
    } };
}
test('Loads only 10 owned published personal exams, with a stable order and safe projection', async () => {
  const db = model(25);
  const result = await listExams(String(owner), { page: '2' }, db);
  assert.equal(String(db.calls.filter.createdBy), String(owner));
  assert.equal(db.calls.filter.scope, 'personal');
  assert.equal(db.calls.filter.status, 'published');
  assert.deepEqual(db.calls.pipeline[0].$match, db.calls.filter);
  assert.deepEqual(db.calls.pipeline[1], { $sort: { updatedAt: -1, _id: -1 } });
  assert.equal(result.items.length, 10);
  assert.equal(result.startItem, 11); assert.equal(result.endItem, 20);
  assert.equal(result.totalPages, 3);
  assert.equal(db.calls.pipeline[2].$skip, 10);
  assert.equal(db.calls.pipeline[3].$limit, 10);
  assert.equal(db.calls.pipeline[4].$project.questionIds, undefined);
});
test('Clamps pages and handles empty or partial final pages', async () => {
  for (const page of ['-1', 'abc', '1.5', '0']) {
    assert.equal((await listExams(owner, { page }, model(25))).currentPage, 1);
  }
  const last = await listExams(owner, { page: '999' }, model(25));
  assert.equal(last.currentPage, 3); assert.equal(last.items.length, 5); assert.equal(last.endItem, 25);
  const empty = await listExams(owner, {}, model(0));
  assert.equal(empty.totalPages, 1); assert.equal(empty.startItem, 0); assert.equal(empty.endItem, 0);
});
test('Search escapes regex syntax, supports Vietnamese accents, and rejects structured keywords', async () => {
  assert.ok(new RegExp(titlePattern('de toan'), 'i').test('Đề Toán')); 
  const literal = new RegExp(titlePattern('.*[a](b)+?$^|\\'), 'i');
  assert.ok(literal.test('.*[a](b)+?$^|\\'));
  assert.ok(!literal.test('arbitrary title'));
  const db = model(0);
  await listExams(owner, { keyword: { $ne: '' } }, db);
  assert.equal(db.calls.filter.title, undefined);
  const result = await listExams(owner, { keyword: 'x'.repeat(500) }, db);
  assert.equal(result.keyword.length, 120);
});
test('Only the owner can access picker endpoint; route precedes assignment id lookup', () => {
  const c = require('../controllers/client/homework.controller');
  let code, next = false;
  c.owner({}, { locals: { owner: false }, status(n) { code = n; return this; }, send() {}, json() {} }, () => { next = true; });
  assert.equal(code, 403); assert.equal(next, false);
  const router = require('../routes/client/homework.route');
  const endpoint = router.stack.findIndex(s => s.route?.path === '/exams');
  const dynamic = router.stack.findIndex(s => s.route?.path === '/:aid');
  assert.ok(endpoint >= 0 && endpoint < dynamic);
  assert.ok(router.stack[endpoint].route.stack.some(s => s.handle === c.owner));
});

function pickerFixture() {
  function element() {
    return { value: '', hidden: true, disabled: false, textContent: '', dataset: {}, children: [], listeners: {},
      addEventListener(type, fn) { this.listeners[type] = fn; },
      setAttribute(name, value) { this[name] = value; },
      append(...nodes) { this.children.push(...nodes); },
      replaceChildren(fragment) { this.children = fragment.children; },
    };
  }
  const names = ['#hw-exam-search', '#hw-exam-list', '#hw-exam-id', '[data-exam-status]', '[data-exam-selected]', '[data-exam-page]', '[data-exam-prev]', '[data-exam-next]', '[data-exam-retry]', '.hw-search-empty'];
  const nodes = Object.fromEntries(names.map(name => [name, element()]));
  const picker = { dataset: { page: '1', pages: '3', endpoint: '/groups/1/homework/exams' }, querySelector: name => nodes[name],
    ownerDocument: { createElement: element, createDocumentFragment: element } };
  return { picker, nodes };
}
const response = (page, items = [{ _id: 'a', title: '<img onerror=alert(1)>', questionCount: 12 }]) => ({
  ok: true, async json() { return { items, currentPage: page, totalPages: 3, totalItems: items.length ? 25 : 0, startItem: items.length ? (page - 1) * 10 + 1 : 0, endItem: items.length ? (page - 1) * 10 + items.length : 0 }; },
});
test('Selection survives pagination and is restored when its page is loaded again', async () => {
  const { picker, nodes } = pickerFixture();
  const api = initHomeworkExamPicker(picker, async () => response(2));
  nodes['#hw-exam-list'].listeners.change({ target: { matches: () => true, value: 'a', closest: () => ({ dataset: { examTitle: 'Đề đã chọn' } }) } });
  await api.load(2);
  assert.equal(nodes['#hw-exam-id'].value, 'a');
  assert.equal(nodes['[data-exam-selected]'].textContent, 'Đã chọn: Đề đã chọn');
  const label = nodes['#hw-exam-list'].children[0];
  assert.equal(label.children[0].checked, true);
  assert.equal(label.children[1].children[0].textContent, '<img onerror=alert(1)>');
});
test('Ignores stale responses and exposes retry after a failed fetch', async () => {
  const { picker, nodes } = pickerFixture();
  const pending = [];
  const api = initHomeworkExamPicker(picker, () => new Promise(resolve => pending.push(resolve)));
  const first = api.load(1), second = api.load(2);
  pending[1](response(2)); await second;
  pending[0](response(1)); await first;
  assert.equal(nodes['[data-exam-page]'].textContent, 'Trang 2 / 3');
  const other = pickerFixture();
  const failed = initHomeworkExamPicker(other.picker, async () => { throw new Error('Mất mạng'); });
  await failed.load(2);
  assert.equal(other.nodes['[data-exam-retry]'].hidden, false);
  assert.equal(other.nodes['[data-exam-status]'].textContent, 'Mất mạng');
});
