# Cân chỉnh giao diện quản trị

Ngày thực hiện: 10/11/2026. Mã nguồn nền: `8629c0f` (nhánh main).

## Thay đổi

- `public/admin/css/admin.css`: thống nhất chiều rộng tối đa 1600px, gutter và padding bằng biến CSS; cân chỉnh sidebar/header, cỡ chữ, thẻ thống kê, form và phân trang. Sidebar chuyển sang drawer ở 900px trở xuống. Navigation cuộn riêng trong vùng còn lại của sidebar; bảng giữ cuộn ngang trong vùng bảng.
- `public/admin/css/dashboard-polish.css`: viết lại thành một tập quy tắc rõ ràng, loại bỏ các khối ghi đè trùng. Chuẩn hóa grid thống kê và thao tác nhanh; bổ sung khoảng cách giữa các panel bên phải và kiểu bảng/badge/trạng thái trống.
- `public/admin/css/topics.css`: dùng grid chung thay vì ép cột phụ riêng; tăng cỡ chữ nội dung.
- `public/admin/css/questions.css`: bỏ khoảng đệm lồng trên mobile; căn trái form với tiêu đề; hợp nhất toolbar và cho bộ lọc xuống hàng ở màn hình laptop.
- `public/admin/css/exams-admin.css`: bỏ max-width độc lập của danh sách; căn trái form và tăng cỡ chữ một số nội dung/điều khiển.
- `public/admin/css/users.css`: chuẩn hóa toolbar, cỡ chữ và footer; giới hạn cuộn ngang trong bảng.
- `public/admin/css/latex.css`: dùng chiều rộng chung và căn lề theo trang, thống nhất typography/nút, giới hạn cuộn bảng; form chuyển một cột ở 1200px trở xuống. Hợp nhất quy tắc preview trùng.
- `public/admin/css/notifications.css`: giới hạn chiều rộng popover theo viewport.
- `public/admin/css/question-editor.css` và `views/admin/question-form.pug`: tách bản định dạng editor dành cho quản trị, dùng gutter chung và chuyển cột công thức xuống dưới ở 1200px. Không chỉnh stylesheet editor phía học sinh.
- `public/admin/js/common.js`: thêm xử lý drawer quản trị với nút menu, backdrop, Escape, điều hướng bàn phím, inert/aria và cập nhật trạng thái khi đổi breakpoint.
- `tests/admin-navigation.test.js`: kiểm thử trạng thái menu, đóng/mở, focus và đổi breakpoint.

Các file CSS đã được định dạng lại để dễ bảo trì; không thêm framework hoặc dependency vào package.json. Các route, controller, model và selector JavaScript của tính năng hiện có được giữ nguyên.

## Kết quả kiểm tra

- Cài dependencies thành công bằng `npm install --ignore-scripts --package-lock=false`.
- `node --check public/admin/js/common.js`: đạt.
- `node --test tests/admin-navigation.test.js`: 9/9 đạt.
- Biên dịch 18 template Pug trong `views/admin`: đạt.
- Render với dữ liệu mẫu 10 trang: dashboard, subjects, topics, questions, users, exams, exam-form, question-form, latex và latex-create: đạt. Việc render chỉ xác nhận template chạy được, không xác nhận bố cục hiển thị.
- Kiểm tra định dạng CSS/JS bằng Prettier và `git diff --check`.

## Giới hạn xác minh

Ứng dụng thực đã được thử khởi động, nhưng thiếu MONGO_URI nên không kết nối được cơ sở dữ liệu. Không dùng dữ liệu sản xuất và không thêm dữ liệu giả vào route thật.

Đã chuẩn bị server xem trước bằng template thật với dữ liệu mẫu. Trình duyệt không kết nối được server localhost trong môi trường này; mở HTML cục bộ cũng bị chính sách trình duyệt từ chối. Vì vậy chưa xác nhận được bố cục trực quan, overflow thực tế, editor Quill/KaTeX, tương tác trình duyệt thật hoặc ảnh chụp sau sửa. Không có ảnh chụp giao diện sản phẩm trong gói ZIP.

Các test tại 1440, 1280, 1024, 768 và 390px là test logic breakpoint menu bằng môi trường DOM mô phỏng, không phải kiểm thử render/responsive trong trình duyệt. Cả năm kích thước vẫn cần kiểm tra trực quan.

## Kiểm tra tiếp trên máy có MongoDB và trình duyệt

1. Cài dependencies, tạo cấu hình .env theo README, chạy seed nếu là database thử nghiệm mới rồi `npm start`.
2. Đăng nhập admin và mở dashboard, môn học, chuyên đề, câu hỏi, tạo/sửa câu hỏi, đề thi, tạo/sửa đề, người dùng, LaTeX và tạo/sửa công thức.
3. Với từng chiều rộng 1440, 1280, 1024, 768 và 390px, kiểm tra trục căn lề, chữ dài, bảng có nhiều dòng, phân trang và trạng thái trống.
4. Ở 768 và 390px: mở menu, đóng bằng backdrop và Escape; kiểm tra Tab/Shift+Tab, điều hướng qua liên kết rồi đổi kích thước về desktop.
5. Mở thông báo và các modal xem trước/xóa/chỉnh sửa, xác nhận chúng không bị cắt hoặc làm tràn trang.
6. Ở form câu hỏi, kiểm tra Quill, lựa chọn đáp án, thư viện công thức và preview KaTeX với nội dung dài.
7. Xác nhận tìm kiếm, bộ lọc, tạo/sửa/xóa và đăng xuất vẫn gọi đúng route. Chụp ảnh desktop/mobile sau khi hoàn thành kiểm tra.

## Gói bàn giao

ZIP chứa toàn bộ mã nguồn dự án, README, yarn.lock, tài liệu và tests; không chứa .git, node_modules, cấu hình .env, cache hay file tạm. Chạy `npm install` sau khi giải nén. Không có thay đổi được đẩy lên GitHub trong tác vụ này.
