# Báo cáo nội dung

Bản này phát triển từ `thpt-practice_homework_search.zip`, giữ nguyên trang chủ của bản đó.

## Phạm vi và người nhận

| Nội dung | Người tiếp nhận |
| --- | --- |
| Báo cáo một nhóm | Tất cả admin đang hoạt động |
| Đề thi hệ thống, bình luận dưới đề hệ thống | Tất cả admin đang hoạt động |
| Đề được chia sẻ vào nhóm, bình luận dưới đề trong nhóm | Chủ nhóm |
| Bài viết trong nhóm, bình luận bài viết | Chủ nhóm |

Backend xác định nhóm và đối tượng từ dữ liệu gốc. Người ngoài nhóm không được báo cáo nội dung riêng trong nhóm. Báo cáo cả nhóm có thể gửi từ trang chi tiết công khai của nhóm.

## Cách dùng

1. Đăng nhập; mở chi tiết nhóm, đề thi, bài viết hoặc bình luận và bấm **Báo cáo**.
2. Chọn lý do, nhập mô tả rồi gửi. Lý do khác bắt buộc mô tả.
3. Người tiếp nhận có thông báo lưu trong cơ sở dữ liệu và cập nhật qua Socket.IO. Chuông thông báo được bổ sung trên giao diện admin.
4. Chủ nhóm vào **Trung tâm báo cáo** trong menu tài khoản hoặc **Xem báo cáo trong nhóm** ở trang nhóm/quản lý thành viên.
5. Admin vào **Quản lý báo cáo** trên sidebar.
6. Mở chi tiết, xem lý do và nội dung được lưu lúc báo cáo, mở nội dung gốc để kiểm tra.
7. Chuyển trạng thái **Đang xem xét**, **Đã xử lý** hoặc **Từ chối**. Khi đóng phải có ghi chú; người gửi nhận thông báo kết quả.

Đường dẫn:
- `/reports`: báo cáo trong các nhóm do tài khoản hiện tại làm chủ.
- `/reports?group=GROUP_ID`: báo cáo của một nhóm do mình làm chủ.
- `/reports?box=sent`: báo cáo đã gửi, theo dõi kết quả.
- `/admin/reports`: báo cáo hệ thống dành cho admin.

Danh sách có bộ lọc trạng thái/loại nội dung, phân trang 15 báo cáo. Người gửi chỉ đọc báo cáo của mình. Chủ nhóm chỉ xử lý báo cáo nội dung trong nhóm do mình quản lý; admin xử lý báo cáo phạm vi hệ thống.

## Quy tắc

- Một tài khoản chỉ có một báo cáo đang mở cho cùng nội dung và phạm vi. Sau khi đóng có thể báo cáo lại.
- Tối đa 10 báo cáo được lưu trong một giờ/tài khoản. Mô tả và ghi chú tối đa 2.000 ký tự.
- Trạng thái: Chờ xử lý → Đang xem xét → Đã xử lý / Từ chối; cũng có thể đóng trực tiếp từ Chờ xử lý. Báo cáo đã đóng không được sửa tiếp.
- Cập nhật kết quả không tự động xóa hoặc khóa nội dung. Người quản lý dùng thao tác quản lý nội dung tương ứng rồi ghi kết quả xử lý.
- Lưu bản chụp văn bản tối đa 2.000 ký tự cùng đường dẫn. Không sao chép ảnh/đáp án; nội dung gốc có thể đã bị xóa hoặc thay đổi.
- Khi chủ nhóm thay đổi, quyền xem/xử lý dựa trên chủ nhóm hiện tại. Người được thông báo lúc gửi là chủ nhóm tại thời điểm đó.
- Nếu nhóm bị xóa, người gửi vẫn xem được báo cáo của mình; hộp thư chủ nhóm không còn lấy nhóm đã xóa.
- Báo cáo được lưu trước khi gửi thông báo. Nếu gửi thông báo gặp lỗi, báo cáo vẫn có trong hộp thư; lỗi thông báo được ghi log.

## Chạy

Giữ cấu hình `.env` và MongoDB hiện có; chạy `npm install`, sau đó `npm start` như dự án cũ. Model `Report` và collection `reports` được tạo qua Mongoose; khởi động ứng dụng tạo các index, gồm index chống báo cáo trùng. Không cần SQL hay sửa dữ liệu cũ.

## Kiểm tra

`node --test tests/reports.test.js tests/homework.test.js`

Các kiểm tra báo cáo dùng model mock: định tuyến người nhận, xác thực nội dung/nhóm, phân quyền, cập nhật cạnh tranh, đóng báo cáo, chống trùng, hạn chế tần suất, thông báo lưu DB/socket và bảo vệ route. Template được render với dữ liệu mẫu và kiểm tra trên trình duyệt. Chưa chạy end-to-end với MongoDB thật; bài kiểm tra tích hợp homework chỉ chạy khi có TEST_MONGO_URI.
