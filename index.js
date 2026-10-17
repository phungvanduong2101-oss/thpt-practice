require("dotenv").config();
const http = require("http");
const initSocket = require("./sockets");
const express = require("express");
const mongoose = require("mongoose");
const cookieParser = require("cookie-parser");
const compression = require("compression");
const morgan = require("morgan");
const path = require("path");

const clientRoutes = require("./routes/client/index.route");
const adminRoutes = require("./routes/admin/index.route");
const authMiddleware = require("./middlewares/auth.middleware");

const app = express();
const PORT = process.env.PORT || 3000;
const server = http.createServer(app);
const io = initSocket(server);

app.set("io", io);
// Cấu hình Pug
app.set("view engine", "pug");
app.set("views", path.join(__dirname, "views"));

// Middleware
app.use(morgan("dev"));
app.use(compression());
app.use(express.json({ limit: "5mb" }));

app.use(express.urlencoded({
  extended: true,
  limit: "5mb",
}));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(authMiddleware.optionalAuth);

// File tĩnh
app.use(express.static(path.join(__dirname, "public")));

// Routes
app.use("/admin", adminRoutes);
app.use("/", clientRoutes);

// Không tìm thấy đường dẫn
app.use((req, res) => {
  res.status(404).send("Không tìm thấy trang");
});

// Xử lý lỗi
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send("Có lỗi xảy ra trên máy chủ");
});

// Khởi động server
async function startServer() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Đã kết nối MongoDB");

    server.listen(3000, () => {
      console.log("Server đang chạy tại http://localhost:3000");
    });
  } catch (error) {
    console.error("Không thể khởi động:", error.message);
    process.exit(1);
  }
}

startServer();