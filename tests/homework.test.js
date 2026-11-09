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
    app.use("/groups", require("../routes/client/group.route"));
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
