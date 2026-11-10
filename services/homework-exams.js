const { Types } = require('mongoose');
const Exam = require('../models/exam.model');

const PAGE_SIZE = 10;
const letters = {
  a: 'aàáạảãâầấậẩẫăằắặẳẵ', e: 'eèéẹẻẽêềếệểễ',
  i: 'iìíịỉĩ', o: 'oòóọỏõôồốộổỗơờớợởỡ',
  u: 'uùúụủũưừứựửữ', y: 'yỳýỵỷỹ', d: 'dđ',
};
function titlePattern(keyword) {
  return [...keyword.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase()]
    .map(char => letters[char] ? `[${letters[char]}]` : char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('');
}
async function listExams(accountId, query = {}, model = Exam) {
  const keyword = typeof query.keyword === 'string' ? query.keyword.trim().slice(0, 120) : '';
  const filter = { createdBy: typeof accountId === 'string' ? new Types.ObjectId(accountId) : accountId, scope: 'personal', status: 'published' };
  if (keyword) filter.title = { $regex: titlePattern(keyword), $options: 'i' };
  const totalItems = await model.countDocuments(filter);
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const requested = Number(query.page);
  const currentPage = Math.min(totalPages, Number.isSafeInteger(requested) && requested > 0 ? requested : 1);
  const skip = (currentPage - 1) * PAGE_SIZE;
  const items = await model.aggregate([
    { $match: filter },
    { $sort: { updatedAt: -1, _id: -1 } },
    { $skip: skip }, { $limit: PAGE_SIZE },
    { $project: { title: 1, duration: 1, questionCount: { $size: { $ifNull: ['$questionIds', []] } } } },
  ]);
  return { items, keyword, totalItems, totalPages, currentPage, pageSize: PAGE_SIZE,
    startItem: totalItems ? skip + 1 : 0, endItem: skip + items.length };
}
module.exports = { listExams, titlePattern };
