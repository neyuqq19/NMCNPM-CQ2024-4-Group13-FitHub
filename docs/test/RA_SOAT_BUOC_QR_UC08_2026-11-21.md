# Rà soát bước thao tác QR và đặt lịch PT

Ngày rà soát: **21/11/2026**. Mã nguồn đối chiếu: `1a3edc79d308368aaa8f8d8d7c9b5cec28d15b4d`.
Phạm vi của Hợp: bộ UC08 trên Drive, task [SCRUM-111](https://nmcnpmg14.atlassian.net/browse/SCRUM-111). UC03 là tài liệu đối chiếu cho QR.

## Kết luận đối chiếu phiên bản

- `CheckIn.tsx`, `CheckInPanel.tsx` và `qr-reader.ts` không có diff giữa commit minh chứng QR `e88a563445e30cfa975efd232e98c245506e0fca` và HEAD.
- `PtBookings.tsx` và `PtBookingPanel.tsx` không có diff giữa commit minh chứng PT `3b28ead` và HEAD.
- Vì vậy, chưa có căn cứ nói các màn hình này đã đổi sau lần chạy gốc. Những chỉnh lý bên dưới làm rõ thao tác mà workbook đang viết tắt; không thay thế lời ghi nhận của lần thực thi cũ.

## Nguồn trên Drive và thông tin phải giữ nguyên

| Bộ | Tài liệu | Ngày chạy gốc | Commit chạy gốc | Kết quả bàn giao |
|---|---|---|---|---|
| QR — UC03 | [Test cases](https://docs.google.com/spreadsheets/d/12oGQ2-ZQtuRN12RlV--EMnlk8ZchU-bq/edit), [Bàn giao](https://docs.google.com/document/d/12zDchZuDv_MQEnm0Li4kxPVeLfUPmSpL/edit) | 16/11/2026 | `e88a563445e30cfa975efd232e98c245506e0fca` | 7 ca chính Pass |
| Đặt PT — UC08 | [Test cases](https://docs.google.com/spreadsheets/d/1Msyr6bRlxUAShp3C_Xr0rHNrVoYIMIrT/edit), [Bàn giao](https://docs.google.com/document/d/1H40VvBXT4b_vGKwX4msWbsnn-1jg5tRc/edit) | 16/11/2026 | `3b28ead` | 7 ca chính Pass; ca mở rộng không cộng vào 7 ca |

Không đổi `Actual Result`, `Status`, `Tester`, `Tested Date`, mã lịch, ngày ca, số buổi hay commit trong `Remark` của lần chạy cũ chỉ vì rà soát tài liệu hôm nay. Ví dụ ca UC08-001 vẫn là `LH000018`, ngày tập `17/11/2026`, số buổi `4 → 3`, ngày test `16/11/2026`, commit `3b28ead`. Ngày tập và ngày test là hai thông tin khác nhau.

Nếu cần hướng dẫn chạy trên bản hiện tại, dùng các bước dưới đây như một bản hướng dẫn riêng; chọn fixture/ngày tương lai khi chạy mới rồi lưu kết quả mới. Không thay ngày ca lịch sử bằng ngày hiện tại trong bản bàn giao cũ.

## UC03 — Đối chiếu từng ca QR

| Case | Rà soát bước thao tác | Xử lý minh chứng cũ |
|---|---|---|
| TC-UC03-001 | Làm rõ: Member đăng nhập → **Mã QR**; Admin đăng nhập → **Check-in** → **Bật camera** → cho phép camera → đưa QR vào khung. Đối chiếu hai màn hình và DB. Không nhấn QR để tạo thành công. | Giữ cả lần API 10:00:00 và lần UI 10:00:13 như bàn giao; không gộp thành cùng một giao dịch. |
| TC-UC03-002 | Giữ bước giữ payload cũ và quét sau `expiresAt` 1 giây bằng đồng hồ test. Màn hình mobile tự đổi QR, nên không mô tả việc chờ màn hình như cách giữ nguyên mã cũ. | Giữ ghi nhận trạng thái mobile qua API; không đổi thành đã quan sát trực tiếp UI. |
| TC-UC03-003 | Làm rõ: Member không có gói → **Mã QR** → thông báo không đủ điều kiện; không có QR. **Thử lại** dùng khi cần thử lại sau lỗi. | Giữ ảnh và kết quả `NO_MEMBERSHIP`, lượt `0 → 0`. |
| TC-UC03-004 | Làm rõ: sau check-in thành công, tải lại mobile → **Mã QR** → xem mốc được thử lại. Các biên +30s, +9m59.999s, +10m dùng đồng hồ dịch vụ test. | Không đổi biên API thành thời gian đã chờ thật trên thiết bị. |
| TC-UC03-005 | Giữ cách gửi lại cùng `requestId`, `scannerId`, payload bằng API. Khi mất phản hồi trên web, thao tác hiện hành là **Kiểm tra lại kết quả**, không quét thành giao dịch mới. Đây là tình huống UI bổ sung, không đồng nhất với ca API cũ. | Giữ giao dịch và kết quả API cũ. Minh chứng mới cho nút đối soát phải ghi riêng. |
| TC-UC03-006 | Giữ cách gửi chuỗi QR giả bằng API; kiểm tra trạng thái QR thật qua API và số lượt. | Không ghi đã dùng camera quét mã giả nếu minh chứng chỉ có API/DB. |
| TC-UC03-007 | Giữ cấp QR → thu hồi đúng phiên cấp QR → quét cùng mã khi còn hạn → kiểm tra gói và số lượt. | Giữ mô tả là kiểm tra API sau thu hồi phiên, không thay bằng thao tác UI khác. |

## UC08 — Các bước đề xuất làm rõ trong workbook

### TC-UC08-001 — Đặt lịch hợp lệ (ô D3)

Giữ nguyên tiền điều kiện và kết quả lịch sử. Bổ sung chi tiết cho bước chọn PT/ca:

1. Ghi số buổi trước đặt và ca `OPEN`.
2. Member đăng nhập mobile → **Tìm huấn luyện viên** → tìm/chọn PT → **Xem hồ sơ & đặt lịch**.
3. Trong hồ sơ, đến **Chọn lịch tập**, chọn ngày trên dải ngày; dùng **Tuần sau** nếu cần. Chọn ca giờ.
4. Trong **Xác nhận đặt lịch**, kiểm tra tên PT, ngày/giờ Việt Nam, **Gói dự kiến**, số buổi còn lại và dòng **Giữ 1 buổi khi đặt**. Chọn **Xác nhận đặt lịch**. **Chọn lại** chỉ đóng xác nhận để chọn lại, không đặt lịch.
5. Sau thông báo thành công, chọn **Đóng hồ sơ** → **Lịch tập của tôi** → **Xem tất cả** → **Sắp tới**; kiểm tra mã/ngày/giờ và số buổi còn lại.
6. Web Admin và Web PT → **Lịch hẹn PT**; đối chiếu lịch, tải lại và kiểm tra DB.

### TC-UC08-002 — Hết buổi PT (ô D4)

1. Ghi số buổi `0` và ca `OPEN`.
2. Đi theo đường chọn PT/ngày/ca như UC08-001 để mở **Xác nhận đặt lịch**.
3. Kiểm tra lỗi không có gói còn buổi hợp lệ và nút **Xác nhận đặt lịch** bị khóa. Không yêu cầu bấm một nút đang bị khóa.
4. Gọi `POST /api/appointments` trực tiếp bằng công cụ test với phiên Member để kiểm tra backend độc lập; không cần mô tả hai thao tác UI/API là đồng thời.
5. Đối chiếu lỗi API, không có lịch mới, ca vẫn `OPEN`, buổi `0 → 0`.

### TC-UC08-003 — Hai người tranh cùng ca (ô D5)

Giữ nguyên bước API đồng thời, hai phiên C/D và cùng `slotId`. Đây là kiểm thử tranh chấp ở API/database; không thay bằng hai thao tác nhấn lần lượt trên UI. Giữ phản hồi `[201, 409]`, số buổi và số lịch theo lần chạy gốc.

### TC-UC08-004 và TC-UC08-006 — Member hủy (ô D6, D8)

1. Member vào **Tìm huấn luyện viên** → **Lịch tập của tôi** → **Xem tất cả** → **Sắp tới**.
2. Chọn đúng mã lịch chưa bắt đầu → **Hủy lịch**.
3. Kiểm tra hộp thoại **Hủy lịch hẹn …?**: ca 004 còn ít nhất 12 giờ được hoàn; ca 006 dưới 12 giờ mất buổi đã giữ.
4. Chọn **Xác nhận hủy**; kiểm tra thông báo kết quả. Mở tab **Đã hủy** để đối chiếu lịch.
5. Kiểm tra DB: ca 004 `4 → 3 → 4`, `REFUNDED`; ca 006 `4 → 3 → 3`, `CONSUMED`; cả hai mở lại ca `OPEN`.

Không thêm bước nhập lý do cho Member: giao diện hiện tại không yêu cầu trường này.

### TC-UC08-005 và TC-UC08-007 — PT hủy (ô D7, D9)

1. Đăng nhập đúng tài khoản PT → **Lịch hẹn PT** → tìm đúng mã lịch chưa bắt đầu → **PT hủy lịch**.
2. Kiểm tra ngày/giờ và cảnh báo: ca 005 dưới 6 giờ được hoàn 1 + đền bù 1; ca 007 ít nhất 6 giờ chỉ hoàn 1.
3. Nhập **Lý do hủy (bắt buộc)** → **Xác nhận hủy lịch**. Nút xác nhận phải khóa khi lý do rỗng.
4. Đối chiếu thông báo, trạng thái lịch, nhãn đền bù và DB: ca 005 `4 → 3 → 5`; ca 007 `4 → 3 → 4`; ca chuyển `UNAVAILABLE`.

## Ghi nhận mới tách khỏi kết quả cũ

Các bộ test đã chạy trong đợt 21/11/2026 trên HEAD nêu đầu tài liệu: web 4/4 và Expo Web 4/4 đạt; đây là số test tự động, không phải khẳng định đã chạy lại từng ca của hai workbook theo tỷ lệ 7/7. QR dùng camera canvas, chưa phải camera/điện thoại vật lý.

Hai vấn đề UI tái hiện riêng: cảnh báo hủy PT không tự cập nhật khi hộp thoại đi qua mốc 6 giờ; lỗi hủy nằm phía sau hộp thoại. Không dùng chúng để sửa ngược báo cáo “0 lỗi trong phạm vi đã chạy” ngày 16/11. Chi tiết và ảnh mới nằm trong `.review/2026-11-21/REVIEW.md`.

Các test UC08 gốc hiện ghi trực tiếp vào `evidence/UC08` và ghi cứng commit `3b28ead`. Đợt rà soát đã dùng bản test tạm với thư mục riêng và commit thực tế, không ghi đè dữ liệu gốc. Không chạy lại test gốc để tạo minh chứng bàn giao mới trước khi tách đường dẫn và metadata.

## Kết quả triển khai sau rà soát

Đã sửa `PtBookings.tsx`: cập nhật thời gian mỗi giây và khi đổi trạng thái hiển thị tab; cảnh báo tự chuyển qua mốc 6 giờ, ngừng cho hủy khi buổi tập bắt đầu. Lỗi hủy hiển thị bên trong hộp thoại, giữ lý do để thử lại; đóng/mở hộp thoại xóa lỗi và lý do cũ.

Đã cập nhật workbook UC08 trên Drive và thêm phụ lục rà soát vào file bàn giao UC08, giữ cùng file ID. UC08 chỉnh D3/D4/D6/D7/D8/D9. Tăng chiều cao các dòng được chỉnh để đọc đủ bước. Đối chiếu tự động xác nhận mọi giá trị ô khác, gồm kết quả, người test, ngày test, commit và liên kết minh chứng, giữ nguyên. Bộ UC08 trong repository đã được đồng bộ với Drive. Không đổi trạng thái task Jira.

Theo yêu cầu giới hạn phạm vi của người dùng, workbook và bàn giao UC03 trên Drive đã được khôi phục nguyên byte về bản gốc trước khi chỉnh; đã đọc lại và đối chiếu với bản sao gốc. Phần UC03 trong tài liệu này chỉ là nhận xét tham khảo, không phải thay đổi đã áp dụng vào tài liệu của người phụ trách UC03.

Kiểm tra bản sửa: typecheck web đạt; build contracts/backend/web đạt; 6 test QR/UI đạt và 1 test hồi quy PT đạt (hiển thị hai vai trò, hủy dưới/trên 6 giờ, đền bù và NO_SHOW). Bộ test mới `pt-bookings-ui.spec.ts` kiểm tra chính xác mốc 6 giờ, lỗi trong hộp thoại và khóa hủy khi buổi tập bắt đầu. Đây là 7 test tự động, không phải thay thế số ca hay kết quả lịch sử trong workbook.

Build vẫn có cảnh báo từ CSS hiện hữu (thiếu dấu đóng trong `@media print`) và kích thước bundle/import QR. Chưa thay đổi phần CSS hoặc cấu hình bundle trong đợt sửa này.

Thông tin bản sửa: dựa trên commit `1a3edc79d308368aaa8f8d8d7c9b5cec28d15b4d`; test được chạy trước khi tạo commit bản sửa trên nhánh `test/scrum-111-hop-uc08-qa`. Minh chứng và bản sao Drive được giữ riêng trên máy trong `.review/2026-11-21/`, không đưa thư mục tạm này vào commit. Không ghi bản sửa thành kết quả của `3b28ead` hoặc `e88a563`.
