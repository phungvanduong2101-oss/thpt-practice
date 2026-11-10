const { test } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const express = require("express");
const { Assignment, Work } = require("../models/homework.model");
const { closeExpired } = require("../services/homework");
const Account = require("../models/account.model"),
  Group = require("../models/group.model");
const Exam = require("../models/exam.model"),
  Question = require("../models/question.model"),
  Subject = require("../models/subject.model");
test(
  "Giao, lưu, thu hồi, gia hạn, chấm và khôi phục bài tập",
  { skip: !process.env.TEST_MONGO_URI },
  async (t) => {
    await mongoose.connect(process.env.TEST_MONGO_URI, {
      dbName: "hw_test_" + new mongoose.Types.ObjectId(),
    });
    t.after(async () => {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    });
    await Work.createIndexes();
    const oid = () => new mongoose.Types.ObjectId();
    const [owner, student, other, group, subject, exam, q] = Array.from(
      { length: 7 },
      oid,
    );
    await Account.collection.insertMany(
      [owner, student, other].map((_id, i) => ({
        _id,
        fullName: "User " + i,
        status: "active",
        email: i + "@test.invalid",
      })),
    );
    await Group.collection.insertOne({
      _id: group,
      ownerId: owner,
      memberIds: [student, other],
      status: "active",
    });
    await Subject.collection.insertOne({
      _id: subject,
      name: "Toán",
      active: true,
    });
    await Question.collection.insertOne({
      _id: q,
      subjectId: subject,
      scope: "system",
      published: true,
      type: "fill",
      content: { html: "Tìm nghiệm" },
      acceptedAnswers: ["2", "3"],
      explanation: { html: "SECRET123" },
      options: [],
    });
    await Exam.collection.insertOne({
      _id: exam,
      groupIds: [],
      scope: "personal",
      createdBy: owner,
      status: "published",
      title: "Đề",
      subjectId: subject,
      questionIds: [q],
    });
    const app = express();
    app.set("view engine", "pug");
    app.use(express.json());
    app.use((req, res, next) => {
      req.account = { _id: req.get("user") };
      res.locals.currentAccount = req.account;
      next();
    });
    app.use("/groups/:id/homework", require("../routes/client/homework.route"));
    app.use("/groups/:id/posts", require("../routes/client/post.route"));
    app.use("/groups", require("../routes/client/group.route"));
    app.use("/account", require("../routes/client/account.route"));
    app.use("/exams", require("../routes/client/exam.route"));
    const server = await new Promise((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    process.env.JWT_SECRET ||= "homework-integration-test";
    const io = require("../sockets")(server);
    app.set("io", io);
    t.after(() => io.close());

    const root =
      "http://localhost:" +
      server.address().port +
      "/groups/" +
      group +
      "/homework";
    async function call(user, path, body, expected) {
      const r = await fetch(root + path, {
        method: body ? "POST" : "GET",
        redirect: "manual",
        headers: { user: String(user), "content-type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const text = await r.text();
      assert.equal(r.status, expected, text.slice(0, 800));
      return text;
    }
    const foreign = await Exam.collection.insertOne({
      ...(await Exam.findById(exam).lean()),
      _id: oid(),
      createdBy: other,
      groupIds: [group],
      title: "ForeignExam",
    });
    const page = await call(owner, "", undefined, 200);
    assert.ok(page.includes(String(exam)) && !page.includes("ForeignExam"));
    await call(
      owner,
      "",
      {
        students: [student],
        title: "BT",
        due: "2090-01-01T00:00",
        examId: foreign.insertedId,
      },
      400,
    );
    await call(
      owner,
      "",
      {
        students: [student],
        title: "BTVN",
        due: "2090-01-01T00:00",
        examId: exam,
      },
      302,
    );
    assert.deepEqual((await Exam.findById(exam).lean()).groupIds, []);
    const Notification = require("../models/notification.model");
    assert.equal(await Notification.countDocuments({recipientId:student,type:"homework_assigned"}),1);
    assert.equal(await Notification.countDocuments({recipientId:other}),0);
    const a = await Assignment.findOne(),
      path = "/" + a.id;
    await call(other, path, undefined, 404);
    await Promise.all([
      call(student, path + "/start", {}, 302),
      call(student, path + "/start", {}, 302),
    ]);
    assert.equal(await Work.countDocuments(), 1);
    await Question.updateOne({ _id: q }, { $set: { acceptedAnswers: ["4"] } });
    const html = await call(student, path + "/work", undefined, 200);
    assert.ok(!html.includes("SECRET123"));
    const answers = { [q]: "2" };
    // Connect an authenticated teacher using Socket.IO's HTTP polling transport.
    const token = require("jsonwebtoken").sign(
      { id: String(owner) },
      process.env.JWT_SECRET,
    );
    const transport = new URL("/socket.io/?EIO=4&transport=polling", root);
    const headers = { cookie: "token=" + token };
    const hello = await (await fetch(transport, { headers })).text();
    transport.searchParams.set("sid", JSON.parse(hello.slice(1)).sid);
    await fetch(transport, { method: "POST", headers, body: "40" });
    const connected = await (await fetch(transport, { headers })).text();
    assert.match(connected, /^40/);
    await call(student, path + "/save", { answers, version: 0 }, 200);
    const update = await (
      await fetch(transport, { headers, signal: AbortSignal.timeout(2500) })
    ).text();
    assert.deepEqual(JSON.parse(update.slice(2)), [
      "homework:progress",
      String(a.id),
    ]);
    const fragment = await call(owner, path + "?view=progress", undefined, 200);
    assert.match(fragment, /1\/1/);
    assert.ok(
      !fragment.includes("<!DOCTYPE") && !fragment.includes("SECRET123"),
    );

    await call(student, path + "/save", { answers: {}, version: 0 }, 409);
    assert.match(
      await call(student, path + "/work", undefined, 200),
      /value="2"/,
    );
    const before = await Work.findOne();
    await call(
      owner,
      path + "/recipients",
      { students: [other], version: 0 },
      302,
    );
    await call(student, path + "/work", undefined, 404);
    await call(
      owner,
      path + "/recipients",
      { students: [other, student], version: 1 },
      302,
    );
    assert.equal(await Notification.countDocuments({recipientId:student,type:"homework_assigned"}),2);
    assert.equal(await Notification.countDocuments({recipientId:other,type:"homework_assigned"}),1);
    await Assignment.collection.insertMany(Array.from({length:12},(_,i)=>({
      groupId:group,title:"PageFixture"+i,due:new Date("2090-01-01"),createdAt:new Date(Date.now()+i*1000),
      recipients:i<11?[student]:[other]
    })));
    const ownerSecond=await call(owner,"?page=2",undefined,200);
    assert.match(ownerSecond,/11–13 \/ 13/);
    const studentSecond=await call(student,"?page=2",undefined,200);
    assert.match(studentSecond,/11–12 \/ 12/);
    assert.ok(!studentSecond.includes("PageFixture11"));
    assert.match(await call(student,"?page=999",undefined,200),/11–12 \/ 12/);
    assert.match(await call(student,"?page=-1",undefined,200),/1–10 \/ 12/);
    await Assignment.deleteMany({title:/^PageFixture/});
    await call(owner, path + "/extend", { due: "2091-01-01T00:00" }, 302);
    await call(student, path + "/start", {}, 302);
    assert.equal((await Work.findOne({ accountId: student })).id, before.id);
    await call(
      student,
      path + "/submit",
      { answers: { [q]: "3" }, version: 1 },
      200,
    );
    await call(student, path + "/result/" + student, undefined, 403);
    assert.match(
      await call(owner, path + "/result/" + student, undefined, 200),
      /SECRET123/,
    );
    await call(other, path + "/start", {}, 302);
    await call(other, path + "/save", { answers, version: 0 }, 200);
    await Assignment.updateOne({ _id: a._id }, { $set: { due: new Date(0) } });
    await call(owner, path + "/extend", { due: "2092-01-01T00:00" }, 409);
    await call(other, path + "/submit", { answers: {}, version: 1 }, 403);
    await Promise.all([closeExpired(), closeExpired()]);
    const works = await Work.find().lean();
    assert.ok(works.every((w) => w.score === 10 && w.status === "submitted"));
    assert.equal(works.filter((w) => w.expired).length, 1);
    assert.match(await call(student, path, undefined, 200), /hw-rank-1/ );
    await call(student, path + "/result/" + other, undefined, 403);


    const postRoot = new URL("/groups/"+group+"/posts",root);
    async function postCall(user,path,body,status) {
      const response=await fetch(String(postRoot)+path,{method:body?"POST":"GET",headers:{user:String(user),"Content-Type":"application/json"},body:body?JSON.stringify(body):undefined,redirect:"manual"});
      const value=await response.text();assert.equal(response.status,status,value.slice(0,500));return value;
    }
    await postCall(other,"",{content:"Bài viết thử <script>alert(1)</script>"},200);
    const {Post,Comment}=require("../models/post.model");
    const post=await Post.findOne();
    const postPath="/"+post.id;
    const rendered=await postCall(owner,postPath,undefined,200);
    assert.ok(rendered.includes("&lt;script&gt;"));
    await postCall(owner,postPath+"/edit",{content:"Sửa trái quyền"},403);
    await postCall(other,postPath+"/edit",{content:"Nội dung mới"},200);
    await postCall(owner,postPath+"/comments",{content:"Bình luận gốc"},200);
    const original=await Comment.findOne();
    await postCall(other,postPath+"/comments",{content:"Trả lời",quotedCommentId:original.id,quoteSnapshot:{authorName:"Giả mạo"}},200);
    const reply=await Comment.findOne({_id:{$ne:original._id}});
    assert.equal(reply.quoteSnapshot.authorName,"User 0");
    assert.equal(reply.quoteSnapshot.contentText,"Bình luận gốc");
    await postCall(owner,postPath+"/comments/"+reply.id+"/edit",{content:"Sửa trái quyền"},403);
    await postCall(other,"",{content:"Bài khác"},200);
    const second=await Post.findOne({_id:{$ne:post._id}});
    await postCall(other,"/"+second.id+"/comments",{content:"Quote khác bài",quotedCommentId:original.id},409);
    await postCall(owner,postPath+"/comments/"+original.id+"/delete",{},200);
    assert.match(await postCall(other,postPath,undefined,200),/Bình luận được trả lời đã bị xóa/);
    await postCall(owner,postPath+"/delete",{},200);
    await postCall(other,postPath,undefined,404);

    const bcrypt=require("bcryptjs");
    await Account.updateOne({_id:other},{$set:{password:await bcrypt.hash("OldPassword123",4)}});
    async function accountCall(path,body,expected){
      const response=await fetch(new URL("/account"+path,root),{method:"POST",headers:{user:String(other),Accept:"application/json","Content-Type":"application/json"},body:JSON.stringify(body)});
      const data=await response.json();assert.equal(response.status,expected,JSON.stringify(data));
    }
    await accountCall("/profile",{fullName:"Tên mới"},200);
    await accountCall("/profile",{fullName:" "},400);
    await accountCall("/email",{email:"new@test.invalid",currentPassword:"wrong"},400);
    await accountCall("/email",{email:"new@test.invalid",currentPassword:"OldPassword123"},200);
    await accountCall("/email",{email:"0@test.invalid",currentPassword:"OldPassword123"},409);
    await accountCall("/password",{currentPassword:"OldPassword123",newPassword:"NewPassword123",confirmPassword:"different"},400);
    await accountCall("/password",{currentPassword:"OldPassword123",newPassword:"NewPassword123",confirmPassword:"NewPassword123"},200);
    assert.ok(await bcrypt.compare("NewPassword123",(await Account.findById(other).select("+password")).password));

    // Public exam landing has discussion but does not create an Attempt.
    const publicExam=await Exam.collection.insertOne({
      title:"Đề công khai",scope:"system",status:"published",subjectId:subject,
      questionIds:[q],duration:30
    });
    async function discussionCall(user,path,body,expected){
      const response=await fetch(new URL(path,root),{method:body?"POST":"GET",headers:{user:String(user),"Content-Type":"application/json"},body:body?JSON.stringify(body):undefined,redirect:"manual"});
      const value=await response.text();assert.equal(response.status,expected,value.slice(0,500));return value;
    }
    const landing="/exams/"+publicExam.insertedId;
    const htmlLanding=await discussionCall(other,landing,undefined,200);
    assert.ok(htmlLanding.includes(landing+"/take"));
    assert.ok(!htmlLanding.includes("SECRET123"));
    await discussionCall(other,landing+"/comments",{content:"Câu này giải thế nào?"},200);
    const ExamComment=require("../models/exam-comment.model");
    const examComment=await ExamComment.findOne();
    await discussionCall(owner,landing+"/comments/"+examComment.id+"/edit",{content:"Sửa trái quyền"},403);
    await discussionCall(other,landing+"/comments/"+examComment.id+"/edit",{content:"Đã hiểu cách giải"},200);
    await Exam.updateOne({_id:exam},{$set:{groupIds:[group],duration:30}});
    const groupLanding="/groups/"+group+"/exams/"+exam;
    assert.ok((await discussionCall(other,groupLanding,undefined,200)).includes(groupLanding+"/take"));
    await discussionCall(other,groupLanding+"/comments",{content:"Thảo luận riêng"},200);
    assert.ok(!(await discussionCall(other,landing,undefined,200)).includes("Thảo luận riêng"));
    await discussionCall(other,groupLanding+"/comments/"+examComment.id+"/delete",{},403);
    const editUrl = new URL("/groups/"+group+"/edit",root);
    async function edit(user,body,expected) {
      const response=await fetch(editUrl,{method:"POST",headers:{user:String(user),Accept:"application/json","Content-Type":"application/json"},body:JSON.stringify(body)});
      assert.equal(response.status,expected);
      return response.json();
    }
    await edit(student,{name:"Không được sửa"},403);
    await edit(owner,{name:"   "},400);
    await edit(owner,{name:"Tên mới",description:"Mô tả",acceptingMembers:false},200);
    assert.equal((await Group.findById(group)).acceptingMembers,false);
    assert.equal((await Group.findById(group)).name,"Tên mới");
    await edit(owner,{name:"Tên mới",acceptingMembers:"true"},200);
    assert.equal((await Group.findById(group)).acceptingMembers,true);
    async function groupAction(user, action, expected) {
      const response=await fetch(new URL("/groups/"+group+"/"+action,root), {
        method:"POST",headers:{user:String(user)},redirect:"manual"
      });
      assert.equal(response.status,expected);
    }
    await groupAction(student,"delete",403);
    await groupAction(owner,"leave",403);
    await groupAction(student,"leave",303);
    await call(student,path,undefined,403);
    assert.ok(!(await Group.findById(group)).memberIds.some(id=>String(id)===String(student)));
    await groupAction(owner,"delete",303);
    assert.equal(await Group.findById(group),null);
    assert.equal(await Group.countDocuments({_id:group}),0);
    assert.equal((await Group.updateOne({_id:group},{$set:{status:"active"}})).matchedCount,0);
    await call(other,path,undefined,404);
    assert.equal(await Work.countDocuments(),2);

  },
);
test("Đảo câu giữ nguyên lựa chọn và quy tắc chấm của ba dạng câu", () => {
  const { shuffle, finish } = require("../services/homework");
  const questions = [
    {
      questionId: "a",
      type: "mcq",
      correctAnswer: "B",
      options: [{ key: "A" }, { key: "B" }],
    },
    {
      questionId: "b",
      type: "truefalse",
      options: [
        { key: "A", isCorrect: true },
        { key: "B", isCorrect: false },
      ],
    },
    { questionId: "c", type: "fill", acceptedAnswers: ["2", "3"] },
  ];
  const copy = structuredClone(questions);
  const mixed = shuffle(questions);
  assert.deepEqual(questions, copy);
  assert.deepEqual(
    [...mixed].sort((a, b) => a.questionId.localeCompare(b.questionId)),
    copy,
  );
  const result = finish(
    { questions: mixed, maxScore: 3 },
    { a: "B", b: { A: true, B: true }, c: "3" },
    false,
  );
  assert.equal(result.score, 2.5);
});

test("Bài giao có thời lượng: đồng thời, offline, restart, gia hạn và tự chốt", { skip: !process.env.TEST_MONGO_URI }, async t => {
  await mongoose.connect(process.env.TEST_MONGO_URI, { dbName: "hw_timed_test_" + new mongoose.Types.ObjectId() });
  t.after(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
  await Work.createIndexes();
  const oid = () => new mongoose.Types.ObjectId();
  const [owner, student, other, group, subject, exam, q] = Array.from({ length: 7 }, oid);
  await Account.collection.insertMany([owner, student, other].map((_id, i) => ({ _id, fullName: "Timed " + i, status: "active", email: i + "@timed.test" })));
  await Group.collection.insertOne({ _id: group, ownerId: owner, memberIds: [student, other], status: "active" });
  await Subject.collection.insertOne({ _id: subject, name: "Toán", active: true });
  await Question.collection.insertOne({ _id: q, subjectId: subject, scope: "system", published: true, type: "fill", content: { html: "Tính" }, acceptedAnswers: ["2"], explanation: { html: "TIMED_SECRET" }, options: [] });
  await Exam.collection.insertOne({ _id: exam, createdBy: owner, scope: "personal", groupIds: [], status: "published", title: "Đề timed", duration: 30, subjectId: subject, questionIds: [q] });
  const events = [], io = { to: room => ({ emit: (event, data) => events.push({ room, event, data }) }) };
  const app = express(); app.set("io", io); app.set("view engine", "pug"); app.use(express.json());
  app.use((req, res, next) => { req.account = { _id: req.get("user"), fullName: "Student", email: "student@test" }; res.locals.currentAccount = req.account; next(); });
  app.use("/groups/:id/homework", require("../routes/client/homework.route"));
  const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const root = "http://127.0.0.1:" + server.address().port + "/groups/" + group + "/homework";
  async function call(user, path, body, status = 200) {
    const r = await fetch(root + path, { method: body === undefined ? "GET" : "POST", redirect: "manual", headers: { user: String(user), Accept: "application/json", "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await r.text(); assert.equal(r.status, status, text.slice(0, 700));
    return (r.headers.get("content-type") || "").includes("application/json") ? JSON.parse(text) : text;
  }
  const tomorrow = new Date(Date.now() + 24 * 3600000);
  const dueInput = new Date(tomorrow.getTime() + 7 * 3600000).toISOString().slice(0, 16);
  const body = { students: [String(student)], title: "Timed HW", examId: String(exam), due: dueInput };
  for (const durationMinutes of [0, -1, 1.5, "abc", true, [], Number.MAX_SAFE_INTEGER])
    await call(owner, "", { ...body, durationMinutes }, 400);
  const created = await call(owner, "", { ...body, durationMinutes: "5" });
  const aid = created.redirectUrl.split("/").pop(), path = "/" + aid;
  let a = await Assignment.findById(aid).lean(); assert.equal(a.durationMinutes, 5);

  await t.test("Bắt đầu đồng thời chỉ có một bài và một mốc thời gian; client không tự đặt đồng hồ", async () => {
    assert.match(await call(student, path), /data-start-warning="true"/);
    assert.match(await call(student, ""), /data-start-warning="true"/);
    await Promise.all(Array.from({ length: 8 }, () => call(student, path + "/start", { startedAt: "2099-01-01", duration: 999, expiresAt: "2099-01-01" })));
    assert.equal(await Work.countDocuments({ assignmentId: aid }), 1);
    const w = await Work.findOne({ assignmentId: aid }).lean();
    assert.equal(w.duration, 5); assert.equal(w.expiresAt.getTime() - w.startedAt.getTime(), 5 * 60000);
    assert.ok(w.startedAt < tomorrow);
  });
  const original = await Work.findOne({ assignmentId: aid }).lean();
  await t.test("Thoát/vào, đổi thiết bị và gia hạn chung không reset giờ", async () => {
    await call(student, path + "/start", {});
    const status = await call(student, path + "/status");
    assert.equal(status.startedAt, original.startedAt.toISOString()); assert.equal(status.expiresAt, original.expiresAt.toISOString());
    assert.equal(typeof status.serverNow, "number");
    const extended = new Date(tomorrow.getTime() + 24 * 3600000 + 7 * 3600000).toISOString().slice(0, 16);
    await call(owner, path + "/extend", { due: extended });
    const w = await Work.findById(original._id).lean();
    assert.equal(+w.startedAt, +original.startedAt); assert.equal(+w.expiresAt, +original.expiresAt);
    const html = await call(student, path + "/work"); assert.ok(!html.includes("TIMED_SECRET"));
    assert.match(html, /data-expires=/);
  });
  await t.test("Tự lưu, version và phục hồi draft đã xác nhận", async () => {
    const saved = await call(student, path + "/save", { answers: { [q]: "2" }, version: 0 });
    assert.equal(saved.version, 1); assert.ok(saved.savedAt);
    await call(student, path + "/save", { answers: { [q]: "wrong" }, version: 0 }, 409);
    const w = await Work.findById(original._id).lean(); assert.equal(w.draft[String(q)], "2"); assert.equal(w.__v, 1);
    assert.match(await call(student, path + "/work"), /value="2"/);
  });
  await t.test("Ngăn save quá giờ ở điều kiện DB kể cả API đã đọc trước đó", async () => {
    const { liveWriteFilter } = require("../services/homework");
    a = await Assignment.findById(aid).lean();
    await Work.updateOne({ _id: original._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    const r = await Work.updateOne(liveWriteFilter(a, original, 1), { $set: { draft: { [q]: "late" } }, $inc: { __v: 1 } });
    assert.equal(r.modifiedCount, 0);
    await Work.updateOne({ _id: original._id }, { $set: { expiresAt: new Date(Date.now() + 50) } });
    const preparedBeforeDeadline = liveWriteFilter(a, original, 1);
    await new Promise(resolve => setTimeout(resolve, 80));
    const delayed = await Work.updateOne(preparedBeforeDeadline, { $set: { draft: { [q]: "late" } }, $inc: { __v: 1 } });
    assert.equal(delayed.modifiedCount, 0);
    assert.equal((await Work.findById(original._id).lean()).draft[String(q)], "2");
  });
  await t.test("Offline tự chốt, chốt trùng và thông báo/tiến độ chỉ phát sau CAS thành công", async () => {
    const before = events.length;
    await Promise.all([closeExpired(io), closeExpired(io), closeExpired(io)]);
    const w = await Work.findById(original._id).lean();
    assert.equal(w.status, "submitted"); assert.equal(w.expired, true); assert.equal(w.score, 10); assert.equal(w.__v, 2);
    const expiry = events.slice(before).filter(e => e.event === "homework:expired");
    assert.equal(expiry.length, 1); assert.equal(expiry[0].room, "account:" + student);
    assert.ok(events.slice(before).some(e => e.event === "homework:progress" && e.room === "account:" + owner));
    await closeExpired(io); assert.equal((await Work.findById(w._id).lean()).__v, 2);
    const status = await call(student, path + "/status"); assert.equal(status.status, "submitted"); assert.equal(status.expired, true);
    await call(student, path + "/save", { answers: {}, version: 2 }, 403);
    await call(student, path + "/submit", { answers: {}, version: 2 }, 403);
    await call(student, path + "/start", {}, 403);
    await call(student, path + "/work", undefined, 302);
    await call(student, path + "/result/" + student, undefined, 403);
    const html = await call(student, ""); assert.ok(!html.includes('action="' + root + path + '/start"'));
    const detail = await call(student, path); assert.ok(!detail.includes("Làm tiếp"));
  });
  await t.test("Hạn chung sớm hơn thời lượng, gia hạn không kéo dài expiresAt hay mở lại bài chốt", async () => {
    const cap = new Date(Date.now() + 30000);
    const capped = await Assignment.create({ ...a, _id: oid(), title: "Capped", due: cap, durationMinutes: 60 });
    const p = "/" + capped.id;
    await call(student, p + "/start", {});
    const w = await Work.findOne({ assignmentId: capped._id }).lean(); assert.equal(+w.expiresAt, +cap);
    await call(owner, p + "/extend", { due: dueInput });
    assert.equal(+(await Work.findById(w._id).lean()).expiresAt, +cap);
    await Work.updateOne({ _id: w._id }, { $set: { expiresAt: new Date(0) } });
    await call(student, p + "/status");
    await call(owner, p + "/extend", { due: new Date(tomorrow.getTime() + 2 * 86400000 + 7 * 3600000).toISOString().slice(0, 16) });
    await call(student, p + "/start", {}, 403);
  });
  await t.test("Chốt sau restart sử dụng MongoDB, không dựa vào timer hoặc socket cũ", async () => {
    const restart = await Assignment.create({ ...a, _id: oid(), title: "Restart", due: tomorrow, durationMinutes: 5 });
    const p = "/" + restart.id;
    await call(student, p + "/start", {}); await call(student, p + "/save", { answers: { [q]: "2" }, version: 0 });
    await Work.updateOne({ assignmentId: restart._id }, { $set: { expiresAt: new Date(0) } });
    const { execFile } = require("node:child_process"), { promisify } = require("node:util");
    await promisify(execFile)(process.execPath, ["-e", `const m=require('mongoose');(async()=>{await m.connect(process.env.TEST_MONGO_URI,{dbName:process.env.HW_DB});await require('./services/homework').closeExpired();await m.disconnect()})().catch(e=>{console.error(e);process.exit(1)})`], { cwd: process.cwd(), env: { ...process.env, HW_DB: mongoose.connection.name }, timeout: 15000 });
    const w = await Work.findOne({ assignmentId: restart._id }).lean(); assert.equal(w.score, 10); assert.equal(w.status, "submitted"); assert.equal(w.expired, true);
  });
  await t.test("Tương thích bài cũ không thời lượng và gia hạn trước khi hết hạn", async () => {
    const old = await Assignment.create({ ...a, _id: oid(), title: "Legacy", due: tomorrow, durationMinutes: undefined });
    const p = "/" + old.id;
    await call(student, p + "/start", {});
    let w = await Work.findOne({ assignmentId: old._id }).lean(); assert.equal(w.expiresAt, undefined);
    const oldStarted = +w.startedAt;
    await call(owner, p + "/extend", { due: new Date(tomorrow.getTime() + 2 * 86400000 + 7 * 3600000).toISOString().slice(0, 16) });
    const status = await call(student, p + "/status"); assert.equal(status.durationMinutes, null); assert.ok(new Date(status.expiresAt) > tomorrow);
    await call(student, p + "/start", {}); assert.equal(+(await Work.findById(w._id).lean()).startedAt, oldStarted);
    await call(student, p + "/save", { answers: { [q]: "2" }, version: 0 });
    await Assignment.updateOne({ _id: old._id }, { $set: { due: new Date(0) } });
    await closeExpired(io); w = await Work.findById(w._id).lean(); assert.equal(w.status, "submitted"); assert.equal(w.score, 10);
  });
  await t.test("Tác vụ chốt đọc lại draft mới nhất khi snapshot ban đầu đã cũ", async () => {
    const r = await Assignment.create({ ...a, _id: oid(), title: "Stale worker", due: tomorrow, durationMinutes: 1 });
    const p = "/" + r.id; await call(student, p + "/start", {});
    const old = await Work.findOne({ assignmentId: r._id }).lean();
    await call(student, p + "/save", { answers: { [q]: "2" }, version: 0 });
    await Work.updateOne({ _id: old._id }, { $set: { expiresAt: new Date(0) } });
    old.expiresAt = new Date(0);
    await require("../services/homework").settleExpired(r.toObject(), old, io);
    const done = await Work.findById(old._id).lean();
    assert.equal(done.__v, 2); assert.equal(done.draft[String(q)], "2"); assert.equal(done.score, 10);
  });
  await t.test("Thành viên bị thu hồi không dùng được start/work/status/save/submit", async () => {
    const r = await Assignment.create({ ...a, _id: oid(), title: "Revoke", due: tomorrow, durationMinutes: 1 });
    const p = "/" + r.id; await call(student, p + "/start", {});
    await call(owner, p + "/recipients", { students: [String(other)], version: r.__v });
    for (const endpoint of ["start", "save", "submit"]) await call(student, p + "/" + endpoint, endpoint === "start" ? {} : { answers: {}, version: 0 }, 404);
    for (const endpoint of ["work", "status"]) await call(student, p + "/" + endpoint, undefined, 404);
  });
  await t.test("Tranh chấp submit / save / tự chốt không ghi đè bài đã nộp", async () => {
    const race = await Assignment.create({ ...a, _id: oid(), title: "Race", due: tomorrow, durationMinutes: 1 });
    const p = "/" + race.id; await call(student, p + "/start", {});
    const responses = await Promise.all(["save", "submit"].map(action => fetch(root + p + "/" + action, { method: "POST", headers: { user: String(student), Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify({ answers: { [q]: "2" }, version: 0 }) })));
    assert.equal(responses.filter(r => r.status === 200).length, 1);
    let w = await Work.findOne({ assignmentId: race._id }).lean();
    if (w.status === "in_progress") {
      await Work.updateOne({ _id: w._id }, { $set: { expiresAt: new Date(0) } });
      await Promise.all([closeExpired(io), fetch(root + p + "/submit", { method: "POST", headers: { user: String(student), Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify({ answers: {}, version: w.__v }) })]);
    }
    w = await Work.findById(w._id).lean(); assert.equal(w.status, "submitted"); assert.equal(w.score, 10);
    const version = w.__v; await closeExpired(io); assert.equal((await Work.findById(w._id).lean()).__v, version);
  });
});
