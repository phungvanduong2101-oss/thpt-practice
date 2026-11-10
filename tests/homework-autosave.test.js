const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createHomeworkSaver } = require("../public/client/js/homework");
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
function setup(send) {
  let answers = {}, callback, delay;
  const states = [], conflicts = [], closed = [];
  const saver = createHomeworkSaver({ version: 0, read: () => answers, send,
    onState: (...state) => states.push(state), onConflict: x => conflicts.push(x), onClosed: x => closed.push(x),
    schedule: (fn, ms) => { callback = fn; delay = ms; return 1; }, cancel: () => { callback = null; },
  });
  return { saver, states, conflicts, closed, edit(value) { answers = value; saver.changed(); }, get callback() { return callback; }, get delay() { return delay; } };
}
test("Tự lưu debounce 800 ms; không báo đã lưu trước xác nhận", async () => {
  const request = deferred(), calls = [];
  const x = setup((action, data) => { calls.push({ action, data }); return request.promise; });
  x.edit({ a: "1" }); x.edit({ a: "2" });
  assert.equal(x.delay, 800); assert.equal(calls.length, 0);
  const pending = x.callback(); assert.equal(calls.length, 1);
  assert.equal(x.states.at(-1)[0], "saving"); assert.equal(x.saver.state().dirty, true);
  request.resolve({ version: 1 }); await pending;
  assert.equal(calls[0].data.answers.a, "2"); assert.equal(x.states.at(-1)[0], "saved"); assert.equal(x.saver.state().dirty, false);
});
test("Thay đổi trong lúc đang lưu được giữ lại và lưu tiếp tuần tự", async () => {
  const first = deferred(), second = deferred(), calls = [];
  const x = setup((action, data) => { calls.push(data); return calls.length === 1 ? first.promise : second.promise; });
  x.edit({ a: "old" }); const pending = x.saver.save();
  x.edit({ a: "new" }); assert.equal(calls.length, 1);
  first.resolve({ version: 1 }); await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.length, 2); assert.deepEqual(calls.map(x => x.version), [0, 1]);
  assert.equal(calls[0].answers.a, "old"); assert.equal(calls[1].answers.a, "new");
  assert.equal(x.saver.state().dirty, true); assert.equal(x.states.at(-1)[0], "saving");
  second.resolve({ version: 2 }); await pending; assert.equal(x.saver.state().dirty, false);
});
test("Lỗi kết nối giữ dirty và retry sau phục hồi", async () => {
  let count = 0;
  const x = setup(async () => { if (++count === 1) throw Error("Mất mạng"); return { version: 1 }; });
  x.edit({ a: "2" }); await x.saver.save();
  assert.equal(x.saver.state().dirty, true); assert.equal(x.states.at(-1)[0], "error");
  await x.saver.retry(); assert.equal(x.saver.state().dirty, false); assert.equal(count, 2);
});
test("Xung đột version khóa hàng đợi, không tự ghi đè hoặc nâng version", async () => {
  const x = setup(async () => { throw Object.assign(Error("Xung đột"), { status: 409 }); });
  x.edit({ a: "2" }); await x.saver.save();
  assert.equal(x.saver.state().blocked, true); assert.equal(x.saver.state().version, 0);
  assert.equal(x.saver.state().dirty, true); assert.deepEqual(x.conflicts, ["Xung đột"]);
  await x.saver.retry(); assert.equal(x.conflicts.length, 1);
});
test("Nộp thủ công chờ lần tự lưu đang chạy và dùng version mới", async () => {
  const first = deferred(), calls = [];
  const x = setup((action, data) => { calls.push({ action, data }); return calls.length === 1 ? first.promise : Promise.resolve({ version: 2 }); });
  x.edit({ a: "1" }); const pending = x.saver.save();
  x.edit({ a: "2" }); const submitted = x.saver.submit();
  first.resolve({ version: 1 }); await Promise.all([pending, submitted]);
  assert.deepEqual(calls.map(c => c.action), ["save", "submit"]);
  assert.equal(calls[1].data.version, 1); assert.equal(calls[1].data.answers.a, "2");
  assert.deepEqual(x.closed, ["submitted"]);
});
test("Hết giờ không gửi thêm request, kể cả khi có debounce hoặc retry", async () => {
  let allowed = true, count = 0, answers = {};
  const saver = createHomeworkSaver({ version: 0, read: () => answers, canSend: () => allowed,
    send: async () => { count++; return { version: count }; }, onState() {}, onConflict() {}, onClosed() {} });
  answers = { a: "1" }; saver.changed(); allowed = false;
  await saver.save(); assert.equal(count, 0); assert.equal(saver.state().dirty, true);
  saver.stop(); allowed = true; await saver.retry(); assert.equal(count, 0);
});

test("Đồng bộ status/reconnect không bỏ qua debounce của thay đổi mới", async () => {
  let calls = 0;
  const x = setup(async () => { calls++; return { version: calls }; });
  x.edit({ a: "2" }); await x.saver.retry(); assert.equal(calls, 0);
  await x.callback(); assert.equal(calls, 1);
});
