# Hệ thống ôn luyện thi tốt nghiệp THPT

Website luyện thi THPT sử dụng Node.js, Express, Pug và MongoDB. Hỗ trợ làm đề, luyện tập theo môn/chuyên đề, soạn đề cá nhân và học tập theo nhóm.

## 1. Chức năng

- Đăng ký, đăng nhập và phân quyền user/admin bằng JWT cookie.
- Làm đề, chấm điểm tự động và xem lịch sử bài làm.
- Hỗ trợ câu hỏi trắc nghiệm, đúng/sai và điền đáp án.
- Soạn câu hỏi, đề thi cá nhân; nhập công thức bằng KaTeX và tải ảnh lên Cloudinary.
- Tạo nhóm, duyệt thành viên và chia sẻ đề trong nhóm.
- Nhận thông báo realtime qua Socket.IO.
- Quản trị môn học, chuyên đề, câu hỏi, đề thi, công thức và người dùng.

## 2. Kiến trúc

```text
                    Trình duyệt
                     ↕       ↕
                   HTTP   Socket.IO
                     ↕    (realtime)
                     ↕       ↕
              Node.js / Express + Pug
                         |
                 +-------+-------+
                 ↕               ↕
              MongoDB        Cloudinary
            Lưu dữ liệu        Lưu ảnh
```

Ứng dụng tổ chức theo MVC. Express render Pug và phục vụ frontend. Socket.IO dùng chung HTTP server và duy trì kết nối với trình duyệt để gửi thông báo realtime.

## 3. Công nghệ

| Thành phần | Công nghệ / Thư viện |
| :--- | :--- |
| Backend | Node.js, Express 5 |
| Giao diện | Pug, HTML, CSS, JavaScript |
| Soạn thảo nội dung | Quill, KaTeX |
| Cơ sở dữ liệu | MongoDB, Mongoose |
| Xác thực | jsonwebtoken, cookie-parser, bcryptjs |
| Giao tiếp realtime | Socket.IO |
| Tải lên và lưu trữ ảnh | Multer, Cloudinary |
| Cấu hình môi trường | dotenv |
| Nén phản hồi và ghi log | compression, morgan |
| Hỗ trợ phát triển | nodemon |
| Kiểm thử tải | k6 |

Danh sách dependency đầy đủ nằm trong `package.json`; phiên bản được khóa trong `yarn.lock`.

## 4. Yêu cầu

- Node.js từ 20.19, kèm npm.
- MongoDB local hoặc MongoDB Atlas.
- Tài khoản Cloudinary để tải ảnh.
- Yarn nếu muốn sử dụng thay npm.

## 5. Cài đặt và cấu hình

### Lấy mã nguồn

```bash
git clone https://github.com/phungvanduong2101-oss/thpt-practice.git
cd thpt-practice
```

### Cài thư viện

Dùng npm:

```bash
npm install
```

Hoặc dùng Yarn:

```bash
yarn install
```

Chọn một trình quản lý gói để sử dụng trong dự án.

### Cấu hình môi trường

Tạo file `.env` tại thư mục gốc:

```dotenv
MONGO_URI=mongodb://127.0.0.1:27017/THPT
JWT_SECRET=replace_with_a_long_random_secret

CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

Thay các giá trị mẫu bằng cấu hình của bạn. Không đưa file `.env` chứa khóa thật lên Git.

## 6. Database và seed tài khoản

Khởi động MongoDB hoặc cấu hình URI Atlas trong `.env`. Không cần tạo database và collection thủ công; MongoDB tạo khi ứng dụng tạo collection hoặc ghi dữ liệu.

Các collection: `accounts`, `subjects`, `topics`, `questions`, `exams`, `attempts`, `groups`, `notifications`, `latexes`.

Chạy tại thư mục gốc để tạo tài khoản demo:

```bash
npm run seed
```

Nếu dùng Yarn:

```bash
yarn seed
```

| Vai trò | Email | Mật khẩu demo |
| :--- | :--- | :--- |
| Admin | `admin@example.com` | `Admin@123456` |
| User | `user@example.com` | `User@123456` |

Mật khẩu được hash bằng bcrypt. Email đã tồn tại sẽ được bỏ qua, không đổi mật khẩu hoặc quyền.


## 7. Chạy server và client

### Chạy khi phát triển

```bash
npm run dev
```

Nếu dùng Yarn:

```bash
yarn dev
```

### Chạy thông thường

```bash
npm start
```

Nếu dùng Yarn:

```bash
yarn start
```

Mở [http://localhost:3000](http://localhost:3000). Mã nguồn hiện cố định cổng `3000`. Frontend được phục vụ cùng server, không cần chạy riêng.

1. Đăng nhập tại `/auth/login` bằng tài khoản admin.
2. Vào `/admin/dashboard`, tạo môn → chuyên đề → câu hỏi → đề; xuất bản để sử dụng.
3. Đăng nhập bằng tài khoản user để làm bài và thử các chức năng. 

## 8. Giao tiếp mạng

- **HTTP:** trình duyệt gửi request đến Express; server trả trang HTML được render bằng Pug hoặc dữ liệu JSON. Tải ảnh sử dụng `multipart/form-data`.
- **Xác thực và phân quyền:** JWT được lưu trong cookie `httpOnly`; middleware xác minh token, trạng thái tài khoản và quyền truy cập.
- **Realtime:** Socket.IO duy trì giao tiếp hai chiều qua WebSocket. Server gửi thông báo đến đúng tài khoản mà không cần tải lại trang.
- **Lưu thông báo:** thông báo được lưu vào MongoDB trước khi gửi realtime để người dùng offline có thể xem lại khi truy cập.
- **Xử lý đồng thời:** Node.js sử dụng I/O bất đồng bộ để phục vụ nhiều request, không tạo một thread riêng cho mỗi người dùng.

Luồng làm bài:

1. Gửi `POST /exams/:examId/start` để tạo lượt làm bài và snapshot.
2. Người dùng làm bài trên trình duyệt.
3. Gửi `POST /exams/submit` để nộp bài.
4. Server chấm điểm và lưu kết quả.
5. Xem kết quả tại `/exams/:attemptId/result`.

## 9. Kiểm thử

### 9.1. Kiểm thử chức năng

Các kết quả dưới đây được người phát triển kiểm thử thủ công và xác nhận.

| STT | Kịch bản kiểm thử | Kết quả thực tế | Đánh giá |
| :---: | :--- | :--- | :---: |
| 1 | Đăng ký, đăng nhập và đăng xuất | Hoạt động đúng; sau đăng xuất, chức năng bảo vệ yêu cầu đăng nhập lại | Đạt |
| 2 | Người dùng thường truy cập trang quản trị | Bị từ chối do không có quyền quản trị | Đạt |
| 3 | Tạo môn học, chuyên đề, câu hỏi và đề thi | Dữ liệu được lưu và hiển thị chính xác | Đạt |
| 4 | Làm bài với ba loại câu hỏi | Điểm và đáp án đúng như dự kiến | Đạt |
| 5 | Chỉnh sửa câu hỏi sau khi bắt đầu làm bài | Lượt làm bài giữ nguyên snapshot | Đạt |
| 6 | Gửi lại yêu cầu nộp cùng một lượt | Kết quả đã nộp không bị ghi đè | Đạt |
| 7 | Truy cập lượt làm bài của tài khoản khác | Không thể xem hoặc nộp thay người sở hữu | Đạt |
| 8 | Xin vào nhóm, duyệt thành viên và chia sẻ đề | Hoạt động đúng chức năng và phân quyền | Đạt |
| 9 | Mở hai tab bằng cùng một tài khoản | Nhận thông báo và đồng bộ trạng thái đã đọc | Đạt |
| 10 | Truy cập lại sau khi offline | Hiển thị được thông báo đã lưu | Đạt |
| 11 | Tải ảnh sai định dạng hoặc vượt 3 MiB | Từ chối tải lên và trả thông báo lỗi | Đạt |
| 12 | MongoDB hoặc Cloudinary không khả dụng | Phản hồi lỗi khi kết nối hoặc thao tác thất bại | Đạt |

### 9.2. Đo tải

Dùng k6 v2.3.0 trên Windows, gửi `GET /exams`. Mỗi VU chờ response rồi nghỉ 1 giây. Mỗi mức tải chạy một lần trong 60 giây; kiểm tra HTTP 200 và nội dung HTML.

Giữ server đang chạy, mở terminal khác tại thư mục gốc và chạy lần lượt:

```bash
k6 run --vus 10 --duration 1m tests/load/exams.js
k6 run --vus 50 --duration 1m tests/load/exams.js
k6 run --vus 100 --duration 1m tests/load/exams.js
```

k6 cần được cài riêng. Script: [exams.js](tests/load/exams.js).

## 10. Kết quả thực nghiệm

### 10.1. Môi trường thực nghiệm

- **Hệ điều hành:** Windows 11.
- **CPU:** Intel Core i7-11800H.
- **RAM:** 16 GB.
- **Node.js:** v24.12.0.
- **MongoDB:** chạy local.
- **Công cụ đo tải:** k6 v2.3.0.
- **Dữ liệu thử nghiệm:** 4 môn học, 60 câu hỏi và 10 đề thi.
- **Triển khai:** k6, server và MongoDB chạy trên cùng một máy; truy cập qua localhost.
- **Kịch bản:** `GET /exams` với 10, 50 và 100 người dùng ảo.
- **Thời gian:** 60 giây/mức tải; mỗi VU nghỉ 1 giây sau mỗi request; mỗi mức chạy một lần.

### 10.2. Kết quả đo tải

| VUs | Tổng request | Trung bình (ms) | p50 (ms) | p95 (ms) | Request/giây | Lỗi HTTP |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | 580 | 41.50 | 37.04 | 49.20 | 9.56 | 0% |
| 50 | 1706 | 783.55 | 770.90 | 886.00 | 27.63 | 0% |
| 100 | 1739 | 2560 | 2580 | 3060 | 27.16 | 0% |

- **p50:** 50% request có thời gian phản hồi không vượt giá trị này.
- **p95:** 95% request có thời gian phản hồi không vượt giá trị này.

Log: [10 VUs](tests/load/result-10.txt) · [50 VUs](tests/load/result-50.txt) · [100 VUs](tests/load/result-100.txt).

### 10.3. Nhận xét

Cả hai check đạt 100%. Khi tăng từ 50 lên 100 VUs, throughput gần như không tăng nhưng p95 tăng từ 886 lên 3060 ms, cho thấy dấu hiệu bão hòa trong môi trường thử nghiệm này.



## 11.Contributions

### 11.1. Bảo toàn dữ liệu bài làm bằng snapshot

Lưu bản sao câu hỏi, đáp án và lời giải khi tạo lượt làm bài. Khi câu hỏi gốc được chỉnh sửa, dữ liệu và kết quả của lượt đã tạo vẫn được giữ nguyên.

### 11.2. Kiểm soát yêu cầu nộp bài đồng thời

- Khi nhiều yêu cầu nộp cùng một lượt được gửi gần nhau, hệ thống chỉ cho phép cập nhật nếu trạng thái hiện tại là `in_progress`.

- Điều kiện này được kiểm tra ngay trong thao tác cập nhật MongoDB, giúp chỉ một yêu cầu chuyển lượt làm sang `submitted` và tránh ghi đè kết quả. 
 
Đây là các đóng góp kỹ thuật trong phạm vi dự án, sử dụng những kỹ thuật đã có để bảo toàn dữ liệu và kiểm soát cập nhật đồng thời. 

## 12. Hạn chế

- **Soạn đề còn thủ công:** người dùng phải nhập từng câu hỏi và tự chọn câu hỏi khi tạo đề; chưa hỗ trợ nhập hàng loạt từ Word/Excel hoặc tự động tạo đề theo ma trận kiến thức và mức độ khó.
- **Khả năng chống gian lận còn hạn chế:** hệ thống chưa kiểm soát được việc người dùng tra cứu tài liệu hoặc sử dụng công cụ bên ngoài trong quá trình làm bài.
- **Soạn hình minh họa còn bất tiện:** trình soạn thảo hỗ trợ công thức toán và chèn ảnh, nhưng chưa có công cụ vẽ trực tiếp đồ thị hoặc hình học.

## 13. Cấu trúc mã nguồn

- `index.js`: Khởi tạo server, kết nối MongoDB và Socket.IO.
- `config/`: Cấu hình các dịch vụ.
- `routes/`: Định nghĩa đường dẫn cho người dùng và quản trị viên.
- `controllers/`: Xử lý nghiệp vụ của từng chức năng.
- `models/`: Định nghĩa cấu trúc dữ liệu bằng Mongoose.
- `middlewares/`: Xác thực, phân quyền và xử lý tải ảnh.
- `views/`: Giao diện được viết bằng Pug.
- `public/`: Các file CSS, JavaScript và hình ảnh.
- `services/`: Xử lý lưu và gửi thông báo.
- `sockets/`: Thiết lập kết nối và xác thực Socket.IO.
- `scripts/seed-accounts.js`: Tạo tài khoản admin và user mẫu.
- `tests/load/`: Script k6 và kết quả kiểm thử tải.

## 14. Tài liệu tham khảo

- [Node.js](https://nodejs.org/en/docs), [Express](https://expressjs.com/), [Pug](https://pugjs.org/).
- [MongoDB](https://www.mongodb.com/docs/), [Mongoose](https://mongoosejs.com/docs/).
- [Socket.IO](https://socket.io/docs/v4/), [jsonwebtoken](https://github.com/auth0/node-jsonwebtoken).
- [Quill](https://quilljs.com/docs/quickstart), [KaTeX](https://katex.org/docs/api), [Cloudinary](https://cloudinary.com/documentation/node_integration).
- [Grafana k6](https://grafana.com/docs/k6/latest/).
