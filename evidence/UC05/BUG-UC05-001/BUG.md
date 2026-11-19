# BUG-UC05-001

**Tên lỗi:** Mobile hiển thị sai trạng thái gói tập PENDING_PAYMENT.

**Test Case liên quan:** TC-UC05-001

**Module:** Mobile Client / Backend

**Mức độ:** Medium (đề xuất, chờ thống nhất theo quy ước phân loại của nhóm).

**Môi trường:** Local Testing – Database fithub_test.

### 1. Tiền điều kiện
- Hội viên M1 đã được Admin đăng ký gói GYM03.
- Giá gói: 1.350.000 VNĐ.
- Membership.status = PENDING_PAYMENT.
- Payment.status = PENDING.
- Chưa xác nhận thanh toán.

### 2. Các bước tái hiện
1. Đăng nhập Web Admin.
2. Đăng ký gói GYM03 cho hội viên M1.
3. Không xác nhận thanh toán.
4. Đăng nhập Mobile Client bằng tài khoản M1.
5. Mở trang chủ và quan sát thông tin gói tập hiện tại.

### 3. Expected Result
Mobile Client phải hiển thị đúng trạng thái gói tập đang chờ thanh toán, không hiển thị thông báo đã hết hạn.

### 4. Actual Result
Mobile Client hiển thị nhãn Chờ thanh toán nhưng dòng thông tin ngày lại hiển thị "Đã kết thúc ngày 16/02/2027", không phù hợp với trạng thái PENDING_PAYMENT của Membership.

### 5. Nguyên nhân
Logic Backend xử lý nhãn allowedHoursLabel chỉ phân biệt trạng thái ACTIVE với các trạng thái còn lại. Vì vậy PENDING_PAYMENT cũng bị hiển thị thông báo đã kết thúc.

### 6. Cách khắc phục
Cập nhật logic xử lý allowedHoursLabel trong auth.service.ts để phân biệt riêng các trạng thái PENDING_PAYMENT, ACTIVE, FROZEN, SCHEDULED, EXPIRED và CANCELLED.

### 7. Kết quả kiểm thử lại
Sau khi sửa:
- Mobile hiển thị đúng trạng thái Chờ thanh toán.
- Thông báo hiển thị: "Chưa kích hoạt · chờ xác nhận thanh toán".
- Không còn hiển thị sai thông báo đã kết thúc.
- Web Admin và Mobile Client hiển thị nhất quán.
- Membership vẫn PENDING_PAYMENT và chưa được kích hoạt trước khi xác nhận thanh toán.

### 8. Trạng thái lỗi
- First Test: FAIL – 17/11/2026.
- Retest: PASS – 17/11/2026.
- Current Status: CLOSED.

### 9. Minh chứng
- evidence/UC05/BUG-UC05-001/bug-before.png
- evidence/UC05/BUG-UC05-001/bug-after.png