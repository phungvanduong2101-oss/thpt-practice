# Bài tập về nhà trong nhóm
Cài dependencies và cấu hình MongoDB, JWT theo mục 10 của README, sau đó chạy
`npm start`. Mở nhóm đang hoạt động → Bài tập về nhà. Chủ nhóm chọn từ các
đề cá nhân đã xuất bản trong Đề của tôi. Học sinh bấm Lưu bài để làm tiếp.

Ứng dụng tạo collection assignments và homework_attempts. HomeworkAttempt dùng cùng
schema bản chụp và cùng hàm chấm với Attempt. Khi khởi động, ứng dụng tạo unique
index (assignmentId, accountId) trong homework_attempts. Tài khoản MongoDB cần quyền
tạo index. Không cần chuyển dữ liệu cũ. Tác vụ chốt chạy lúc khởi động và sau mỗi
lần quét 30 giây. Schema đề hiện tại là danh sách questionIds phẳng.

Chạy kiểm thử bằng Node 22+ với MongoDB riêng cho môi trường kiểm thử:
```sh
TEST_MONGO_URI=mongodb://127.0.0.1:27017 node --test tests/homework.test.js
```
Trên PowerShell đặt $env:TEST_MONGO_URI trước khi chạy node --test.
Bộ test tạo và xóa database tạm tên hw_test_ kèm ObjectId ngẫu nhiên.
