require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
});

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
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

async function seedAccounts() {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error("Thiếu MONGO_URI trong file .env.");
    }

    await mongoose.connect(process.env.MONGO_URI);
    console.log("Đã kết nối MongoDB.");

    // Đảm bảo index unique của email đã được tạo.
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
        // Trường hợp hai tiến trình seed chạy cùng lúc.
        if (error.code !== 11000) throw error;

        console.log(`Bỏ qua: ${account.email} vừa được tạo.`);
      }
    }

    console.log("Hoàn tất seed tài khoản.");
  } catch {
    console.error(
      "Seed thất bại. Kiểm tra MONGO_URI, kết nối và quyền truy cập MongoDB."
    );
    process.exitCode = 1;
  } finally {
    try {
      await mongoose.disconnect();
    } catch {
      console.error("Không thể đóng kết nối MongoDB.");
      process.exitCode = 1;
    }
  }
}

seedAccounts();