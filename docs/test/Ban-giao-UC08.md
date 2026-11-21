# Bàn giao kiểm thử UC08 · Đặt lịch PT

Ngày 16/11/2026, cả 7 ca chính đều Pass. Ghi nhận 0 lỗi sản phẩm và 0 ca bị chặn trong phạm vi đã chạy. Trịnh Văn Hợp phụ trách phần QA (SCRUM-111). Trương Minh Quang phụ trách đối chiếu nghiệp vụ/kỹ thuật UC08, Nguyễn Trần Minh Trí tổng hợp kết quả (SCRUM-112).

## Bản kiểm thử và môi trường

- FitHub trên nhánh `main`, commit `3b28ead`. Cây mã nguồn sạch trước khi thử. Các đoạn đo và chụp ảnh chạy qua bộ test tự động (`src/web-client/tests/pt-bookings.spec.ts` và `src/mobile-client/tests/uc08-pt-booking-e2e.spec.ts`).
- Đối chiếu với `rup_ucspec-v2_final.docx`, UC08 mục 3.3.4 (luồng chính, luồng rẽ nhánh A1–A3, ngoại lệ E1–E2, BR01–BR04, SR01–SR02), `rup_sad.docx` mục 4.5 và hướng dẫn `03-Hop-UC08-Dat-lich-PT.md`.
- Windows 11, Node.js 22+, Microsoft Edge, Playwright. Mobile chạy Expo Web ở khung 390 × 844. Web Admin và Web PT chạy ở khung 1280 × 960.
- PostgreSQL riêng tại `127.0.0.1:55432`, database `fithub_test` (đã áp dụng toàn bộ 20 migration, không tác động Supabase chung, không đổi đồng hồ hệ thống chung). Thời gian hiển thị trên giao diện dùng giờ Việt Nam (`Asia/Ho_Chi_Minh`), các trường JSON kết thúc bằng `Z` dùng UTC.

## Đọc minh chứng

Mở sheet **Test cases** trong `UC08-Test-cases.xlsx` rồi tra thư mục theo `Case ID` trong cột `Remark`. Mỗi ca từ `TC-UC08-001` đến `TC-UC08-007` đều có `api-db.json` ghi nhận đầy đủ dữ liệu từ API NestJS và truy vấn đối chiếu PostgreSQL (gồm số buổi PT tại 3 mốc: `beforeBook`, `afterBook`, `afterCancel`, trạng thái `Appointment` và trạng thái `WorkingSlot`).

- **TC-UC08-001:** Đặt lịch qua giao diện Mobile (`01-mobile-before-book.png`, `02-mobile-confirm-modal.png`, `03-mobile-after-book.png`) và đối chiếu hiển thị trên cả Web Admin (`04-web-admin-view.png`) lẫn Web PT (`05-web-trainer-view.png`). Số buổi PT giảm `4 → 3`, ca chuyển `BOOKED`.
- **TC-UC08-002:** Hội viên có `0` buổi PT bị chặn trên cả hộp thoại xác nhận Mobile (`01-mobile-zero-pt-rejected.png`) và API (`400 INSUFFICIENT_PT_SESSIONS`). Số buổi giữ nguyên `0 → 0`, ca vẫn `OPEN`.
- **TC-UC08-003:** Hai hội viên đều có `3` buổi PT gửi đồng thời `POST /api/appointments` vào cùng một `slotId`. Phản hồi trả về `[201, 409 SLOT_ALREADY_BOOKED]`; người thành công giảm `3 → 2`, người bị từ chối giữ nguyên `3 → 3`, chỉ có 1 lịch hẹn lưu trong DB.
- **TC-UC08-004 & TC-UC08-006 (Hội viên hủy lịch):** Kiểm tra mốc `>= 12h` (`TC-UC08-004`: hoàn buổi `4 → 3 → 4`, `REFUNDED`, mở lại ca `OPEN`) và mốc `< 12h` (`TC-UC08-006`: mất buổi đã giữ `4 → 3 → 3`, không bị trừ lần hai, `CONSUMED`, mở lại ca `OPEN`).
- **TC-UC08-005 & TC-UC08-007 (PT hủy lịch):** Kiểm tra trên Web PT mốc `< 6h` (`TC-UC08-005`: hoàn 1 buổi + đền bù 1 buổi `4 → 3 → 5`, `compensationGranted=true`, khóa ca `UNAVAILABLE`) và mốc `>= 6h` (`TC-UC08-007`: chỉ hoàn 1 buổi `4 → 3 → 4`, `compensationGranted=false`, khóa ca `UNAVAILABLE`).

Ca âm (`TC-UC08-002`, `TC-UC08-003`) được tính Pass khi hệ thống từ chối đúng mã lỗi và bảo toàn số buổi PT. Các phép thử biên mở rộng (gửi lặp hủy lần hai, Admin xác minh `NO_SHOW`) đã kiểm tra đạt nhưng không cộng vượt quá 7 ca chính.

Workbook dùng đúng mẫu của nhóm, gồm hai sheet **Features** và **Test cases**.


## Rà soát mô tả bước thao tác — 21/11/2026

Chỉ bổ sung chi tiết ở cột Test step (D3, D4, D6, D7, D8, D9) để thao tác rõ hơn theo giao diện đã đối chiếu. Không đổi tiền điều kiện, ngày ca, Actual Result, Status, Tester, Tested Date, Remark hay các minh chứng của lần bàn giao gốc: **16/11/2026 — commit `3b28ead`**. Kết quả 7 ca chính Pass ở trên vẫn là kết quả của lần chạy gốc, không phải kết quả chạy mới ngày 21/11.

Các bước API tiếp tục được ghi là API; không đổi thành đã thao tác trên giao diện hoặc thiết bị thật. Ca dùng lại minh chứng cũ giữ nguyên thời gian và commit gốc. Lần chạy mới phải có thư mục minh chứng, thời điểm thực thi và thông tin phiên bản riêng.
