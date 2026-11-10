# Phân trang chọn đề giao bài

Bổ sung trên bản đã chỉnh giao diện quản trị; giữ nguyên các chỉnh sửa quản trị, tính giờ và tự lưu bài tập.

## Hành vi

- Danh sách chọn đề tải tối đa 10 đề/trang từ máy chủ, có nút Trước/Sau và tổng số đề phù hợp.
- Tìm tên đề trên toàn bộ các đề cá nhân đã xuất bản của chủ nhóm, hỗ trợ chữ hoa/thường và tìm không dấu tiếng Việt.
- Tìm kiếm có debounce 300 ms; Enter chỉ tìm đề, không gửi form giao bài.
- Chọn đề rồi đổi trang hoặc tìm tên khác vẫn giữ đề đã chọn trong input riêng. Quay lại trang chứa đề sẽ đánh dấu radio tương ứng.
- Đổi trang/tìm kiếm không tải lại trang, không xóa tên bài, hạn nộp, thời lượng hay người nhận.
- Có thông báo đang tải, không có kết quả, lỗi và nút thử lại. Phản hồi cũ bị bỏ qua khi đã có tìm kiếm mới.
- Chưa chọn đề sẽ được nhắc trước khi gửi; máy chủ vẫn kiểm tra quyền và tính hợp lệ của đề khi giao bài.

## Mã nguồn

- `services/homework-exams.js`: truy vấn phân trang, tìm kiếm, chỉ trả tiêu đề/thời lượng/số câu; không tải toàn bộ questionIds vào giao diện.
- `controllers/client/homework.controller.js`: tải trang đầu cho chủ nhóm và cung cấp dữ liệu chọn đề.
- `routes/client/homework.route.js`: GET `/groups/:id/homework/exams`, đặt trước route `/:aid`, yêu cầu đăng nhập, là thành viên nhóm và là chủ nhóm.
- `views/client/homework.pug`: vùng chọn đề, thông tin trang, lựa chọn lưu riêng và trạng thái tải.
- `views/client/homework-layout.pug`: nạp script chọn đề riêng.
- `public/client/js/homework-exam-picker.js`: tải trang/tìm kiếm và duy trì lựa chọn.
- `public/client/js/homework.js`: bỏ tìm kiếm toàn bộ danh sách tại trình duyệt, thêm kiểm tra đã chọn đề.
- `public/client/css/homework.css`: định dạng vùng chọn và thanh phân trang.
- `tests/homework-exam-picker.test.js`: kiểm tra truy vấn, trang biên, regex, quyền owner, thứ tự route, lưu lựa chọn và phản hồi sai thứ tự/lỗi.

## Kiểm tra

`node --test tests/homework-exam-picker.test.js tests/homework-autosave.test.js tests/admin-navigation.test.js`

22/22 test đạt (6 test mới cho chọn đề, 7 test tự lưu và 9 test menu quản trị). Log trong `homework-exam-picker-test-results.txt`.

Node syntax check đạt cho các file JS thay đổi. Pug compile đạt; template render đạt cho chủ nhóm có đề, chủ nhóm chưa có đề và học sinh.

Các test truy vấn dùng model giả lập, test giao diện dùng DOM giả lập. Chưa chạy kiểm thử tích hợp MongoDB hoặc xác minh trực quan trong trình duyệt do môi trường hiện tại chưa có cấu hình database và trình duyệt không truy cập được bản chạy thử. Không tuyên bố đã kiểm tra bố cục trình duyệt thật.

Không thay đổi schema database; không cần migration. Sau khi giải nén, cài dependencies và cấu hình .env theo README như trước. Chưa đẩy thay đổi lên GitHub.
