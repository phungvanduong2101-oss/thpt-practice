
require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
});

const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");

const collections = [
  "subjects",
  "topics",
  "questions",
  "exams",
  "latexes",
];

async function exportData() {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error("Thiếu MONGO_URI.");
    }

    await mongoose.connect(process.env.MONGO_URI);

    const folder = path.join(__dirname, "data");
    fs.mkdirSync(folder, { recursive: true });

    for (const name of collections) {
      const data = await mongoose.connection.db
        .collection(name)
        .find({})
        .toArray();

      fs.writeFileSync(
        path.join(folder, `${name}.json`),
        JSON.stringify(data, null, 2),
        "utf8"
      );

      console.log(`${name}: xuất ${data.length} bản ghi.`);
    }

    console.log("Xuất dữ liệu thành công.");
  } catch (error) {
    console.error("Xuất dữ liệu thất bại:", error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

exportData();
