/* Đặt file trong scripts của dự án, chạy: node scripts/fix-lang-giang-note.js */
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const note = 'Đáp án mặc định theo yêu cầu nhập liệu, chưa xác minh: trắc nghiệm A; mọi mệnh đề Đúng; trả lời ngắn 2.7. Không có lời giải.';
const idFor = key => new mongoose.Types.ObjectId(crypto.createHash('sha256').update('thpt-lg1-2026-l1:' + key).digest('hex').slice(0, 24));
async function main() {
  if (!process.env.MONGO_URI) throw new Error('Thiếu MONGO_URI trong .env.');
  await mongoose.connect(process.env.MONGO_URI);
  const ids = [];
  for (const code of ['1209','1210']) for (const [part,count] of [['I',12],['II',4],['III',6]]) {
    for (let n=1;n<=count;n++) ids.push(idFor(`${code}:${part}:${n}`));
  }
  const db = mongoose.connection.db;
  const questions = await db.collection('questions').updateMany({
    _id: { $in: ids }, scope: 'system', 'explanation.html': `<p>${note}</p>`,
  }, { $set: { explanation: { html: '', delta: null }, updatedAt: new Date() } });
  let exams = 0;
  for (const code of ['1209','1210']) {
    const result = await db.collection('exams').updateOne({
      _id: idFor(`exam:${code}`), scope: 'system', description: 'Mã đề ' + code + '. ' + note,
    }, { $set: { description: 'Đề kiểm tra rèn kỹ năng làm bài lần 1, Toán 12, THPT Lạng Giang số 1, năm học 2026–2027. Mã đề ' + code + '.', updatedAt: new Date() } });
    exams += result.modifiedCount;
  }
  const topics = await db.collection('topics').updateMany({
    code: 'LG1_2026_L1', description: 'Nhập từ PDF, mã 1209 và 1210. ' + note,
  }, { $set: { description: 'Đề Toán 12 Lạng Giang số 1, lần 1, năm học 2026–2027. Mã 1209 và 1210.', updatedAt: new Date() } });
  let cleaned = 0;
  for await (const question of db.collection('questions').find({ _id: { $in: ids }, scope: 'system' })) {
    const set = {};
    const prefix = /^Phần (?:I|II|III) – Câu \d+\.\s*/;
    if (question.content?.html) {
      const html = question.content.html.replace(/^(<p>)Phần (?:I|II|III) – Câu \d+\.\s*/, '$1');
      if (html !== question.content.html) set['content.html'] = html;
    }
    const ops = question.content?.delta?.ops;
    if (ops?.length && typeof ops[0].insert === 'string' && prefix.test(ops[0].insert)) {
      const copy = JSON.parse(JSON.stringify(ops)); copy[0].insert = copy[0].insert.replace(prefix, '');
      set['content.delta.ops'] = copy;
    }
    if (typeof question.contentText === 'string') {
      const text = question.contentText.replace(/^\[LG1 12(?:09|10) (?:I|II|III)\.\d+\]\s*/, '').replace(prefix, '');
      if (text !== question.contentText) set.contentText = text;
    }
    if (Object.keys(set).length) {
      // Do not overwrite concurrent edits made after this document was read.
      const result = await db.collection('questions').updateOne({ _id: question._id, content: question.content, contentText: question.contentText }, { $set: { ...set, updatedAt: new Date() } });
      cleaned += result.modifiedCount;
    }
  }
  await db.collection('exams').updateMany({ _id: { $in: ['1209','1210'].map(code => idFor(`exam:${code}`)) },
    description: { $in: ['1209','1210'].map(code => 'Đề kiểm tra rèn kỹ năng làm bài lần 1, Toán 12, THPT Lạng Giang số 1, năm học 2026–2027. Mã đề ' + code + '.') } },
    { $set: { description: '', updatedAt: new Date() } });
  await db.collection('topics').updateMany({ code: 'LG1_2026_L1', description: 'Đề Toán 12 Lạng Giang số 1, lần 1, năm học 2026–2027. Mã 1209 và 1210.' },
    { $set: { description: '', updatedAt: new Date() } });
  console.log(`Đã bỏ số phần/số câu khỏi ${cleaned} câu hỏi.`);
  console.log(`Đã xóa ghi chú: ${questions.modifiedCount} lời giải, ${exams} mô tả đề, ${topics.modifiedCount} mô tả chuyên đề.`);
  console.log('Các trường đã tự sửa hoặc không còn ghi chú được giữ nguyên. Chạy lại an toàn.');
}
main().catch(error => {
  console.error('Không sửa được:', error.name === 'MongoServerSelectionError' ? 'Không kết nối được MongoDB.' : error.message);
  process.exitCode = 1;
}).finally(() => mongoose.disconnect());
