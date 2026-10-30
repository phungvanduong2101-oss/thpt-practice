
require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
});

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");

const Account = require("../models/account.model");

const accounts = [
  {
    fullName: "Quản trị viên",
    email: "admin@example.com",
    password: "Admin@123456",
    role: "admin",
    status: "active",
  },
  {
    fullName: "Người dùng",
    email: "user@example.com",
    password: "User@123456",
    role: "user",
    status: "active",
  },
];

const collections = [
  "subjects",
  "topics",
  "questions",
  "exams",
  "latexes",
];

const objectIdFields = {
  subjects: [],
  topics: ["subjectId"],
  questions: ["subjectId", "topicId"],
  exams: ["subjectId", "createdBy", "questionIds"],
  latexes: [],
};

async function seedAccounts() {
  await Account.init();

  for (const account of accounts) {
    const existingAccount = await Account.findOne({
      email: account.email,
    });

    if (existingAccount) {
      console.log(`Bỏ qua: ${account.email} đã tồn tại.`);
      continue;
    }

    const passwordHash = await bcrypt.hash(account.password, 10);

    try {
      await Account.create({
        ...account,
        password: passwordHash,
      });

      console.log(`Đã tạo ${account.role}: ${account.email}`);
    } catch (error) {
      if (error.code !== 11000) throw error;

      console.log(`Bỏ qua: ${account.email} vừa được tạo.`);
    }
  }
}

function restoreDocument(doc, name, adminId) {
  const result = { ...doc };

  result._id = new mongoose.Types.ObjectId(result._id);

  for (const field of objectIdFields[name] || []) {
    if (Array.isArray(result[field])) {
      result[field] = result[field].map(
        (id) => new mongoose.Types.ObjectId(id)
      );
    } else if (result[field]) {
      result[field] = new mongoose.Types.ObjectId(result[field]);
    }
  }

  // Gán tác giả đề thi mẫu cho tài khoản admin.
  if (name === "exams") {
    result.createdBy = adminId;
  }

  for (const field of ["createdAt", "updatedAt"]) {
    if (result[field]) {
      result[field] = new Date(result[field]);
    }
  }

  return result;
}

async function seedData(adminId) {
  for (const name of collections) {
    const filePath = path.join(
      __dirname,
      "data",
      `${name}.json`
    );

    if (!fs.existsSync(filePath)) {
      throw new Error(`Không tìm thấy file: ${filePath}`);
    }

    const documents = JSON.parse(
      fs.readFileSync(filePath, "utf8")
    );

    if (!Array.isArray(documents)) {
      throw new Error(`${name}.json phải chứa một mảng.`);
    }

    const collection = mongoose.connection.db.collection(name);

    let inserted = 0;

    for (const item of documents) {
      const doc = restoreDocument(item, name, adminId);

      const result = await collection.updateOne(
        { _id: doc._id },
        { $setOnInsert: doc },
        { upsert: true }
      );

      if (result.upsertedCount) inserted++;
    }

    console.log(
      `${name}: thêm ${inserted}/${documents.length} bản ghi.`
    );
  }
}

async function seed() {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error("Thiếu MONGO_URI trong file .env.");
    }

    await mongoose.connect(process.env.MONGO_URI);
    console.log("Đã kết nối MongoDB.");

    await seedAccounts();

    const admin = await Account.findOne({
      email: "admin@example.com",
    });

    if (!admin || admin.role !== "admin") {
      throw new Error("Không tìm thấy tài khoản admin hợp lệ.");
    }

    await seedData(admin._id);

    console.log("Hoàn tất seed database.");
  } catch (error) {
    console.error("Seed thất bại:", error);
    process.exitCode = 1;
  } finally {
    try {
      await mongoose.disconnect();
    } catch (error) {
      console.error("Không thể đóng kết nối:", error);
      process.exitCode = 1;
    }
  }
}

seed();
