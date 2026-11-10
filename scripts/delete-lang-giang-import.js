/* Đặt trong scripts, chạy: node scripts/delete-lang-giang-import.js */
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const idFor = key => new mongoose.Types.ObjectId(crypto.createHash('sha256').update('thpt-lg1-2026-l1:' + key).digest('hex').slice(0, 24));
async function main() {
  if (!process.env.MONGO_URI) throw new Error('Thiếu MONGO_URI trong .env.');
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  const examIds = ['1209','1210'].map(code => idFor(`exam:${code}`));
  const ids = [];
  for (const code of ['1209','1210']) for (const [part,count] of [['I',12],['II',4],['III',6]]) {
    for (let n=1;n<=count;n++) ids.push(idFor(`${code}:${part}:${n}`));
  }
  const exams = await db.collection('exams').deleteMany({ _id: { $in: examIds }, scope: 'system' });
  // Leave questions that have since been reused in a different exam intact.
  const otherExams = await db.collection('exams').find({ questionIds: { $in: ids } }, { projection: { questionIds: 1 } }).toArray();
  const reused = new Set(otherExams.flatMap(e => (e.questionIds || []).map(String)));
  const removable = ids.filter(id => !reused.has(String(id)));
  const questions = await db.collection('questions').deleteMany({ _id: { $in: removable }, scope: 'system' });
  let topics = 0;
  for await (const topic of db.collection('topics').find({ code: 'LG1_2026_L1' })) {
    if (!await db.collection('questions').findOne({ topicId: topic._id }, { projection: { _id: 1 } })) {
      const result = await db.collection('topics').deleteOne({ _id: topic._id, code: 'LG1_2026_L1' });
      topics += result.deletedCount;
    }
  }
  console.log(`Đã xóa ${exams.deletedCount} đề, ${questions.deletedCount} câu và ${topics} chuyên đề riêng không còn dùng.`);
  const kept = ids.length - removable.length;
  if (kept) console.log(`Giữ lại ${kept} câu vì đang được dùng trong đề khác.`);
  console.log('Không xóa môn học, tài khoản, bài làm hoặc dữ liệu khác. Có thể chạy lại mà không xóa thêm dữ liệu ngoài bộ import.');
}
main().catch(error => {
  console.error('Xóa thất bại:', error.name === 'MongoServerSelectionError' ? 'Không kết nối được MongoDB.' : error.message);
  process.exitCode = 1;
}).finally(() => mongoose.disconnect());
