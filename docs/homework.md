# Bài tập về nhà trong nhóm

Tính năng mở rộng trên Assignment, HomeworkAttempt, API `/start`, `/work`, `/status`, `/save`, `/submit`, hàm `finish()` và Socket.IO hiện có. Luồng thi/luyện tập và collection `attempts` không thay đổi.

## Cài đặt và dữ liệu

Cài dependencies, cấu hình MongoDB/JWT theo mục 10 của README rồi chạy `npm start`. Khuyến nghị Node 22+, MongoDB 4.2+ (đã kiểm thử trên MongoDB 7.0.24). Không cần dependency mới cho production.

- `assignments.durationMinutes`: số nguyên dương theo phút. Để trống khi tạo bài nếu chỉ áp dụng hạn nộp chung.
- Bài làm có thời lượng dùng `homework_attempts.duration` hiện có để lưu số phút, `startedAt` và `expiresAt` để lưu mốc tính giờ lần đầu.
- `expiresAt` chỉ được ghi trong `$setOnInsert`: mốc sớm hơn giữa `startedAt + duration` và hạn nộp chung lúc bắt đầu; không cấp lại thời gian khi gia hạn.
- Bài giao/bài làm cũ không có `expiresAt` tiếp tục theo hạn nộp chung hiện tại. Giá trị `duration: 1` của bài cũ là placeholder, không được diễn giải thành giới hạn một phút.
- Tiếp tục dùng `draft`, `savedAt`, `__v`, `status`, `expired`, `answers`, `score`, `submittedAt` đang có. Không chạy migration đặt thời gian mới cho bài cũ.
- Unique index `{ assignmentId: 1, accountId: 1 }` bảo vệ bắt đầu đồng thời.
- Bổ sung index `{ status: 1, expiresAt: 1 }` để tìm bài làm đang làm đã hết thời lượng. Không dùng TTL, không xóa bài làm.
- `Work.createIndexes()` đã có ở khởi động và sẽ tạo index mới. Tài khoản MongoDB cần quyền tạo index; nếu có dữ liệu trùng cặp assignment/account từ trước thì cần xử lý trùng trước khi tạo unique index.

Không cần thêm biến môi trường. `MONGO_URI`, `JWT_SECRET`, cấu hình ảnh giữ nguyên. Đồng bộ đồng hồ của máy chạy Node/MongoDB bằng NTP; thời gian không dựa vào đồng hồ do trình duyệt gửi.

## Chủ nhóm

Mở nhóm → Bài tập về nhà. Giữ nguyên chọn đề cá nhân đã xuất bản, chọn người nhận, tên bài và hạn nộp. Có thêm trường thời lượng (phút); số thập phân, số âm, 0, giá trị không hữu hạn hoặc ngoài phạm vi Date được từ chối ở backend.

Có thể gia hạn chung trước khi hạn chung cũ hết. Gia hạn không sửa `startedAt`, `duration`, `expiresAt` của bài có thời lượng, cũng không mở lại bài đã chốt. Với bài cũ không giới hạn riêng, hạn mới áp dụng cho bài chưa chốt.

## Học sinh và tự lưu

- Trước lần bắt đầu đầu tiên có xác nhận: thoát trang, offline, tải lại hoặc đổi thiết bị không dừng/đặt lại thời gian.
- `/start` upsert theo cặp assignment/account và `$setOnInsert`; request song song lấy lại cùng bài, cùng thứ tự câu hỏi, cùng mốc thời gian.
- `/work` khôi phục draft, version và mốc hết giờ lưu trong MongoDB. Giao diện phải đồng bộ `/status` trước khi mở nhập đáp án.
- Sửa đáp án sẽ gọi `/save` bằng fetch sau debounce 800 ms. Chỉ một request lưu/nộp đang chạy; thay đổi mới trong thời gian chờ được giữ riêng và lưu tiếp ngay sau lần trước.
- “Đã lưu” chỉ xuất hiện khi server xác nhận đúng revision đã gửi; xác nhận một bản cũ không xóa dirty của thay đổi mới.
- Giữ nút Lưu bài/Nộp bài thủ công. Nộp thủ công chờ request lưu đang chạy rồi dùng version mới, đồng thời khóa nhập khi đang nộp.
- Lỗi mạng giữ draft trên trang; thử lại khi `online`, Socket.IO reconnect, quay lại tab hoặc kiểm tra trạng thái định kỳ, nếu còn thời gian.
- HTTP 409 là xung đột version: khóa nhập và yêu cầu tải lại, không tự đổi version để ghi đè tab khác. Nếu server lưu thành công nhưng mất phản hồi, lần thử lại có thể nhận 409; người dùng tải lại để lấy bản máy chủ.
- Cảnh báo rời trang nếu còn thay đổi chưa xác nhận. Draft chưa gửi thành công chỉ tồn tại trên trang hiện tại; đóng trang hoặc quá giờ khi offline có thể mất những thay đổi này.

## API và thời hạn

`GET .../status` trả `serverNow` (Unix ms), `expiresAt`, `startedAt`, `durationMinutes`, `due`, `status`, `expired`, `available`, `version`, `savedAt`. Giữ `now` làm alias tương thích.

`POST .../save` và `/submit` giữ body `{ answers, version }`; trả version mới, savedAt, status, serverNow, expiresAt. Không nhận thời gian/điểm/trạng thái do client quyết định.

Mỗi endpoint start/work/status/save/submit kiểm tra tài khoản, nhóm, người nhận, bài làm và thời hạn. `/status`/`work`/`start`/`save`/`submit` tự chốt bài hết giờ khi truy cập, ngoài tác vụ quét nền.

Mỗi update lưu/nộp có điều kiện `in_progress`, `__v` và `$expr` so sánh thời hạn với `$$NOW` của MongoDB ngay khi thực hiện update. Request được đọc trước hạn nhưng thực hiện update sau hạn không thể ghi thêm đáp án. Cùng một version chỉ có một lần lưu/nộp thắng.

Quyền/metadata của Assignment được đọc mới theo từng request; các cập nhật Work là atomic trên một document. Không dùng transaction nhiều collection, do đó thay đổi người nhận/gia hạn đang chạy đồng thời với request đã qua bước kiểm tra không có tính nguyên tử xuyên hai collection. expiresAt của bài có thời lượng luôn giữ cố định.

## Tự chốt và Socket.IO

- Một vòng quét chung trong `index.js`; chờ vòng trước hoàn thành rồi nghỉ 1.000 ms. Không tạo timer riêng cho học sinh và không có hai vòng cùng tiến trình chạy chồng nhau.
- Chạy quét và chờ hoàn tất trước khi mở HTTP server lúc khởi động. Thời gian máy chủ dừng vẫn được tính bằng các Date đã lưu.
- `closeExpired(io)` tìm bài timed đã hết giờ qua index. Bài legacy chưa chốt (expiresAt thiếu/null) được kiểm tra theo hạn Assignment hiện tại.
- `settleExpired()` dùng `finish(work, work.draft, true)` chấm draft cuối lưu thành công. Update có CAS theo version, trạng thái và điều kiện hết giờ trong MongoDB; khi gặp version mới đọc lại draft rồi chấm lại. Sau tối đa 4 lần tranh chấp, lần quét tiếp theo sẽ thử tiếp.
- Chỉ worker cập nhật thành công mới gửi `homework:expired` tới `account:<accountId>` và gửi `homework:progress` theo room chủ nhóm hiện tại. Nộp thủ công và worker khác không ghi đè được kết quả đã nộp.
- Payload hết giờ: `{ assignmentId, workId, status: 'submitted', expired: true, serverNow, expiresAt }`.
- UI khóa nhập khi đồng hồ về 0, hiện đang xác nhận chốt; chỉ báo “hệ thống đã nộp” khi có event sau commit hoặc `/status` trả submitted. Poll `/status` mỗi 5 giây, gọi lại khi tải trang/kết nối lại, không dựa riêng Socket.IO.
- Tiến độ giáo viên vẫn dùng `homework:progress` + fragment hiện có và đối soát định kỳ.
- Danh sách/chi tiết không hiển thị Làm tiếp cho bài đã hết thời lượng, kể cả trước khi worker kịp chốt.
- Chi tiết đáp án/bảng xếp hạng học sinh vẫn chỉ mở sau hạn nộp chung. Hết thời lượng riêng không mở đáp án sớm.

## Kiểm thử

```sh
node --test tests/homework-autosave.test.js tests/reports.test.js
TEST_MONGO_URI=mongodb://127.0.0.1:27017 node --test tests/homework.test.js tests/homework-autosave.test.js tests/reports.test.js
```

PowerShell:
```powershell
$env:TEST_MONGO_URI='mongodb://127.0.0.1:27017'
node --test tests/homework.test.js tests/homework-autosave.test.js tests/reports.test.js
```

Dùng MongoDB dành cho test. Bộ tích hợp tạo/xóa database tạm `hw_test_*`/`hw_timed_test_*`, không dùng database production. Không có TEST_MONGO_URI thì hai bài tích hợp được đánh dấu SKIP; các bài kiểm tra queue/chấm/report vẫn chạy.

Các tình huống: bắt đầu 8 request đồng thời, vào lại/đổi thiết bị, dữ liệu thời gian giả từ client, tự lưu và version, phục hồi draft, chặn ghi quá hạn trực tiếp ở DB, offline auto-close, nhiều worker chốt trùng, snapshot draft cũ, process mới chốt sau downtime, hạn chung sớm hơn thời lượng, gia hạn, bài legacy, thu hồi quyền, race lưu/nộp/chốt và giữ khóa đáp án tới hạn chung.

## Giới hạn vận hành

Thời điểm chốt thực tế có độ trễ theo thời gian xử lý + khoảng nghỉ 1 giây; mọi save/submit vẫn bị chặn đúng mốc bởi điều kiện DB. Bài legacy chưa nộp cần kiểm tra Assignment trong vòng quét nên chi phí tăng theo số legacy đang làm. Socket.IO có thể mất event khi kết nối hỏng hoặc process dừng sau commit; trạng thái MongoDB và đối soát `/status` khôi phục giao diện. Với nhiều instance Node, CAS vẫn bảo vệ dữ liệu nhưng cần Socket.IO adapter dùng chung để broadcast tới client kết nối ở instance khác.

## Kết quả bàn giao ngày 10/11/2026

Đã chạy đủ 36 kiểm tra, 36 đạt, 0 lỗi, 0 bỏ qua trên MongoDB 7.0.24 tạm và Node 24. Log đầy đủ ở `docs/homework-test-results.txt`. Đã kiểm tra trình duyệt với MongoDB và Socket.IO thật: tự lưu đáp án, reload giữ draft/giờ, hết thời lượng khóa nhập và nhận trạng thái đã tự nộp. Không dùng dữ liệu/tài khoản thật của người dùng.

Chưa kiểm thử tải lớn, triển khai nhiều instance hoặc gián đoạn mạng dài trên thiết bị thật; các lỗi mạng/đồng thời được kiểm tra có kiểm soát trong bộ test. Các giới hạn draft chưa xác nhận và broadcast nhiều instance được nêu ở trên.

Các file thay đổi so với bản reports_ui:
- `models/homework.model.js`: thời lượng của Assignment, expiresAt của Work và index.
- `controllers/client/homework.controller.js`: tạo bài, start/status/work/save/submit, trạng thái danh sách/chi tiết, gia hạn.
- `services/homework.js`: thời hạn, điều kiện update, CAS chốt và sự kiện Socket.IO.
- `index.js`: quét khi khởi động và mỗi 1 giây sau vòng trước.
- `public/client/js/homework.js`: đồng hồ/status, hàng đợi tự lưu, nút lưu/nộp, reconnect/version và cảnh báo bắt đầu.
- `public/client/css/homework.css`, `views/client/homework*.pug`, `views/client/partials/homework-progress.pug`: hiển thị thời lượng, hết giờ và trạng thái lưu.
- `tests/homework.test.js`, `tests/homework-autosave.test.js`: kiểm thử tích hợp và hàng đợi trình duyệt.
- `README.md`, tài liệu trong `docs/`: cấu hình, dữ liệu, kiểm thử và giới hạn.
