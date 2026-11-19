# Gia hạn và thanh toán gói trên mobile

## Luồng sử dụng

Vào thẻ Gói tập hiện tại → Gia hạn. Hội viên chọn gói, xem giá và kỳ sử dụng dự kiến, xác nhận tạo đơn. Đơn mới là `PENDING_PAYMENT` / `PENDING`, chưa có quyền sử dụng. Ngày gym gợi ý nối tiếp kỳ đã mua; gói không gồm gym bắt đầu từ ngày server hiện tại.

Hội viên có thể tiếp tục VNPay hoặc đưa mã đơn cho lễ tân thu tại quầy. Các đơn gần đây được đọc từ database, không lưu danh sách thanh toán trong localStorage. Nếu mất phản hồi lúc tạo đơn, tải lại giao dịch rồi mở đơn đã lưu trước khi tạo lại.

Chỉ kết quả backend cấp quyền lợi mới được hiển thị thành công. `CONFIRMED` với `benefitStatus != GRANTED` hiện yêu cầu lễ tân đối soát; không bảo người dùng thanh toán lần nữa. Kỳ tương lai là `SCHEDULED`, không thay thế kỳ đang dùng.

## API

| Endpoint | Quyền và mục đích |
|---|---|
| GET /api/my/purchase-options | MEMBER, danh mục đang bán, ngày server và ngày nối tiếp của chính mình |
| POST /api/memberships/register | MEMBER, nhận RegisterMembershipRequest; không nhận memberId từ client |
| GET /api/my/payments | MEMBER, 20 giao dịch gần nhất của chính mình (API đã có) |
| GET /api/my/payments/:id | MEMBER, đọc trạng thái đơn của chính mình |
| POST /api/my/payments/:id/cancel | MEMBER, hủy đơn PENDING/FAILED chưa được xử lý, trong transaction |
| POST /api/payments/:id/vnpay-url | MEMBER chủ đơn hoặc ADMIN; dùng lại API VNPay hiện có |

API Admin vẫn yêu cầu ADMIN. Cả tạo đơn tại quầy và mobile dùng chung kiểm tra giá, ngày tháng lịch, bảo lưu, chồng kỳ, giới hạn SCHEDULED, khóa và idempotency. Hội viên không được đổi giá hoặc xác nhận thu tiền mặt.

Đơn đã xác nhận không hủy qua API này. Khi yêu cầu VNPay PENDING còn hạn, phải chờ kết quả hoặc hết hạn mới được hủy; callback đến sau hủy dùng cơ chế đối soát sẵn có. Không sửa schema hoặc thêm migration.

## Chế độ thanh toán

- SIMULATED: chưa chuyển tiền thật. Nút thử chỉ xuất hiện khi server trả simulationAllowed=true; backend tiếp tục chặn giả lập ở production.
- SANDBOX: mở URL HTTPS từ backend bằng trình duyệt. Người dùng trở lại app và kiểm tra trạng thái; không tin tham số kết quả trên URL quay về.
- Cần tài khoản/cấu hình VNPay sandbox và IPN truy cập được từ cổng để thử giao nhận thực tế. VNPAY_RETURN_URL hiện là cấu hình backend dùng chung, cần cấu hình trang trả về phù hợp khi triển khai. Không ghi secret vào repository.
- Thử nghiệm tự động đợt này dùng SIMULATED và PostgreSQL test riêng, chưa xác nhận giao dịch với VNPay bên ngoài hoặc thiết bị native thật.

Khi mở đơn PENDING, mobile đọc trạng thái định kỳ 4 giây trong foreground và đọc lại khi app trở lại active. Có nút kiểm tra thủ công khi mất mạng. Không hiển thị thành công chỉ vì người dùng bấm mở cổng thanh toán.

## Kiểm tra

Từ src: npm run test:mobile -- purchase.spec.ts package-status.spec.ts (chạy qua runner bảo vệ database local fithub_test). Sáu test mới trong backend/test/sales.test.ts bao phủ phân quyền, giả mạo memberId, giá thay đổi, idempotency, hủy, VNPay thất bại/thử lại và kỳ gia hạn. Không chạy fixture hoặc seed trên Supabase chung.
