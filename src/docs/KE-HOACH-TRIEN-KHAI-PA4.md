# Kế hoạch triển khai FitHub — PA4

Ngày lập: 06/11/2026. Bắt đầu: 07/11/2026. Hạn nộp theo đề: 21/11/2026.

## 1. Mục tiêu và nguyên tắc phạm vi

Ưu tiên chức năng hoàn chỉnh, dữ liệu thật và bằng chứng kiểm thử. Không dùng số lượng màn hình hoặc chức năng làm thước đo hoàn thành.

- Web admin và backend chạy local; PostgreSQL dùng Supabase theo kiến trúc đã chọn.
- Web và Android gọi chung API NestJS; chỉ backend truy cập database.
- Prototype đã hoàn tất phần thiết kế; kiểm tra liên kết và bổ sung mô tả mục đích, thông tin, cách sử dụng từng màn hình khi đóng gói tài liệu.
- Phần a của đề nằm ngoài lịch triển khai này theo yêu cầu của nhóm; điều này không có nghĩa đề miễn phần a.

## 2. Phạm vi cam kết

1. Đăng nhập với tài khoản seed Admin/Member; kiểm tra quyền ở backend.
2. Quản lý hội viên: danh sách, tìm kiếm, xem, thêm và sửa hồ sơ; kiểm tra dữ liệu trùng và thiếu.
3. Đăng ký gói tại quầy: chọn hội viên đã xác minh, chọn gói và tạo đăng ký chờ thanh toán.
4. Xác nhận thu tiền mặt: lưu giao dịch và kích hoạt gói trong một database transaction; gửi lại yêu cầu không tạo giao dịch trùng.
5. Android: đăng nhập, xem gói của chính mình và các trạng thái chưa có gói/còn hạn/hết hạn từ API thật.
6. Kiểm thử UC02, UC04, UC05: ít nhất 5 ca mỗi UC, chạy tất cả ít nhất một lần; thêm ca cho xác nhận thu tiền do luồng chính có dùng chức năng này.

Tài khoản ACTIVE không đồng nghĩa có gói còn hạn. Hồ sơ tạo tại quầy chưa xác minh phải giữ đúng trạng thái; dùng hội viên seed đã xác minh cho luồng đăng ký gói chính. Không tự đánh dấu xác minh chỉ để demo.

## 3. Chức năng mở rộng có điều kiện

Chỉ bắt đầu khi luồng web chính đã tích hợp, dữ liệu mobile khớp và các ca ưu tiên đã chạy đạt:

- Mobile sinh QR check-in và xử lý tại màn hình quầy thử nghiệm.
- Kiểm tra quyền gói, mã hết hạn, khóa check-in lại trong 10 phút và chống ghi trùng.
- Nếu chưa có thiết bị cổng thật, mô tả rõ phần mô phỏng thiết bị trong báo cáo và demo.

Không đưa PT, AI, thiết bị, thống kê nâng cao, thanh toán online hoặc phát hành Google Play vào cam kết PA4 này. Dừng thêm chức năng sau 15/11.

## 4. Phân công 5 thành viên

| Thành viên | Phần triển khai chính | Đầu ra và kiểm thử |
|---|---|---|
| Nguyễn Hữu Quyền — PM/Implementer | Tạo khung web/mobile/backend, cấu hình chung, database và đăng nhập/phân quyền | Prisma schema/migration/seed, kết nối Supabase, API và màn hình đăng nhập web/mobile, kiểm tra quyền, API client dùng chung theo từng nền tảng, hướng dẫn chạy; viết/chạy ca UC02; điều phối và báo cáo hằng tuần |
| Võ Nhật Liệu — BA/Implementer | Phát triển tính năng hội viên xuyên suốt giao diện web và backend; chốt quy tắc nghiệp vụ | Danh sách/tìm kiếm/xem/thêm/sửa hội viên, kiểm tra dữ liệu và trạng thái xác minh; viết/chạy ca UC04 |
| Trịnh Văn Hợp — Designer/Implementer | Phát triển danh mục gói và đăng ký gói xuyên suốt web/backend; hoàn thiện bố cục và thành phần giao diện dùng chung trên khung có sẵn | API danh mục gói và tạo đăng ký chờ thanh toán, màn hình chọn gói, trạng thái tải/lỗi; viết/chạy ca UC05 cùng Quang; tài liệu prototype |
| Trương Minh Quang — Implementer | Phát triển xác nhận thu tiền, kích hoạt gói và lịch sử giao dịch xuyên suốt web/backend | API và màn hình thu tiền/lịch sử, transaction kích hoạt gói, chống xác nhận trùng; phối hợp hợp đồng dữ liệu với Hợp; viết/chạy ca thu tiền và hỗ trợ UC05 |
| Nguyễn Trần Minh Trí — Tester/Implementer | Phát triển trang chủ mobile và xem gói trên khung/đăng nhập do Quyền bàn giao; tổng hợp test plan/test report theo mẫu Moodle | Mobile đọc API thật, xử lý chưa có gói/còn hạn/hết hạn; kiểm thử chéo, kiểm tra quyền dữ liệu; QR nếu đạt điều kiện mở rộng |

Quyền phụ trách nền tảng và đăng nhập, các thành viên phát triển module tính năng trên khung đó. Chủ tính năng chịu trách nhiệm cả API, giao diện liên quan và kiểm thử; thống nhất schema với Quyền trước khi đổi dữ liệu. Hợp hỗ trợ giao diện dùng chung, không phải tự triển khai toàn bộ màn hình của các thành viên khác.

Mỗi người tự kiểm tra phần mình và tham gia kiểm thử chéo. Trí tổng hợp kết quả, không gánh toàn bộ việc viết và chạy test. Nếu thêm QR: Quang xử lý backend sau khi hoàn tất giao dịch; Hợp làm màn hình quầy; Trí làm mobile; Quyền tích hợp; Liệu chốt quy tắc và ca kiểm thử.

## 5. Lịch triển khai

| Ngày | Công việc | Điều kiện hoàn thành |
|---|---|---|
| 07/11 | Quyền dựng khung web/mobile/backend, cấu hình và schema bản đầu; Liệu chốt quy tắc hội viên; Hợp/Quang chốt giao tiếp đăng ký gói–thu tiền; Trí chuẩn bị test plan và luồng mobile | Có khung chạy tối thiểu, hợp đồng API, cấu trúc module và hướng dẫn khởi động để các thành viên bắt đầu làm song song |
| 08/11 | Quyền hoàn tất kết nối Supabase, migration/seed và API đăng nhập/phân quyền; Liệu nối danh sách hội viên; Hợp/Quang phát triển module trên khung; Trí làm trang chủ/xem gói | Web lấy dữ liệu từ DB; có tài khoản seed, cách gửi token và dữ liệu API mẫu; test plan theo mẫu Moodle đã khởi tạo |
| 09–10/11 | Quyền hoàn tất màn hình đăng nhập web/mobile và tích hợp phiên; Liệu hoàn thiện hội viên; Hợp làm danh mục/đăng ký gói; Quang làm thu tiền; Trí nối xem gói | API chặn truy cập sai quyền; tìm/thêm/sửa hội viên chạy thật; các ca UC02/04 sẵn sàng |
| 11–12/11 | Tích hợp chọn gói → chờ thanh toán → xác nhận thu tiền → kích hoạt; mobile xem gói | Demo xuyên suốt web–API–DB–mobile; gửi lại xác nhận không thu tiền/kích hoạt hai lần |
| 13–15/11 | Chạy đủ ca của 3 UC, sửa lỗi; nếu đạt điều kiện thì làm check-in QR | Có kết quả thực thi, log lỗi; QR không được làm chậm phạm vi cam kết |
| 16–18/11 | Đóng băng chức năng; kiểm thử chéo, sửa lỗi và chạy lại ca bị ảnh hưởng | Ít nhất 15 ca của 3 UC được thực thi, ghi kết quả; có môi trường test và báo cáo lỗi |
| 19–20/11 | Hoàn thiện tài liệu, quay demo, thử chạy từ hướng dẫn trên máy thành viên khác | Có mã nguồn, script DB, tài khoản mẫu, hướng dẫn, prototype và báo cáo test; không lộ thông tin bí mật |
| 21/11 | Dự phòng, kiểm tra gói và nộp theo thời gian quy định trên Moodle | Nộp đúng hạn, kiểm tra mở được file/link |

Quyền tổng hợp báo cáo hằng tuần theo lịch môn học, lấy bằng chứng từ commit, ảnh demo và kết quả test của từng thành viên. Các ngày 13/11 và 20/11 là mốc tổng hợp nội bộ đề xuất, không thay thế lịch báo cáo chính thức của lớp.

## 6. Database và API tối thiểu để chốt ngày đầu

Quyền là người phụ trách chính database và đăng nhập/phân quyền. Liệu cung cấp nhu cầu dữ liệu hội viên; Hợp cung cấp nhu cầu danh mục/đăng ký gói; Quang cung cấp nhu cầu giao dịch; Trí xác nhận dữ liệu mobile cần đọc. Các thay đổi schema được thống nhất với Quyền và lưu thành migration trong mã nguồn.

- Nhóm dữ liệu: users, member_profiles, packages, memberships, payments; nếu làm QR thì thêm dữ liệu token/check-in theo thiết kế thống nhất.
- Tách trạng thái tài khoản, xác minh, đăng ký gói và giao dịch; ngày giờ do server kiểm tra.
- Giữ giá trị tiền/điều khoản tại thời điểm đăng ký để thay đổi danh mục gói không sửa ngược giao dịch cũ.
- Endpoint nhóm: đăng nhập/thông tin tài khoản hiện tại; hội viên; danh mục gói; đăng ký gói; xác nhận thu tiền; gói của hội viên hiện tại.
- Thống nhất cấu trúc trả lỗi, định dạng ngày giờ và quy tắc phân trang/tìm kiếm trước khi nối giao diện.
- Mobile lấy hội viên từ phiên đăng nhập; không cho đọc gói của người khác bằng cách đổi ID.
- Bí mật DB ở backend; cung cấp .env.example không chứa mật khẩu thật. Seed dùng dữ liệu mẫu, không dùng dữ liệu cá nhân thật.
- Điện thoại thật gọi IP nội bộ của máy chạy backend khi cùng mạng; cấu hình môi trường riêng với máy ảo.

## 7. Buổi làm đầu tiên: 07/11

1. 30 phút: cả nhóm duyệt phạm vi cam kết và phần mở rộng.
2. Quyền bàn giao khung chạy tối thiểu trong ngày: thư mục module, cấu hình môi trường mẫu, kết nối DB ban đầu và cách chạy từng ứng dụng. Cả nhóm chốt schema và hợp đồng API; từng người bắt đầu module riêng.
3. Triển khai lát cắt đầu tiên: seed hội viên → API danh sách → bảng hội viên trên web.
4. Cuối buổi: chạy thử chung, ghi việc hoàn thành/vướng mắc; mỗi người nhận đầu việc ngày tiếp theo.

Mốc bàn giao nền tảng: 07/11 có khung và quy ước; 08/11 có migration/seed và API xác thực; 09–10/11 hoàn tất giao diện đăng nhập web/mobile. Trong lúc chờ API, các thành viên dùng phản hồi mẫu theo hợp đồng đã chốt; loại bỏ mock khỏi luồng nghiệm thu khi API sẵn sàng. Không bỏ kiểm tra quyền trên bản tích hợp.

## 8. Tiêu chí hoàn thành

- Luồng chính chạy từ giao diện qua API và database; tải lại vẫn có dữ liệu.
- Backend kiểm tra quyền và dữ liệu, không chỉ khóa nút trên giao diện.
- Thu tiền/kích hoạt gói nhất quán và không tạo trùng khi gửi lại.
- Mobile hiển thị đúng gói đã tạo từ web.
- Các ca kiểm thử có bước thực hiện, dữ liệu, kết quả mong đợi/thực tế, trạng thái và bằng chứng cần thiết; lỗi sửa xong được chạy lại.
- Người khác trong nhóm có thể chạy theo README và dữ liệu seed.
- Tài liệu prototype có mô tả từng màn hình; gói nộp đáp ứng các mục b–e của đề. Không suy diễn rằng có nhiều chức năng sẽ bù được tài liệu/test còn thiếu.
