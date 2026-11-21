# THÔNG TIN MÔI TRƯỜNG VÀ KẾT QUẢ KIỂM THỬ UC05

## 1. Môi trường kiểm thử

- **Hệ điều hành:** macOS 26.0
- **Trình duyệt:** Arc
- **Cách chạy:** Sử dụng Docker cho các dịch vụ cần thiết. Backend, Frontend và Mobile được khởi chạy bằng các lệnh npm trong Terminal.
- **Cơ sở dữ liệu:** PostgreSQL
  - **Database:** `fithub_test`
  - **Port:** `54329`

## 2. Lệnh khởi chạy môi trường

Mở Terminal và chuyển đến thư mục `src` của dự án:

```bash
cd /Users/mgow/PROJECTS/FitHub/ver2/NMCNPM-CQ2024-4-Group13-FitHub/src
```

### 2.1. Backend

```bash
PORT=3000 \
VNPAY_MODE=SIMULATED \
VNPAY_HASH_SECRET='fithub_local_test_secret_123456' \
DATABASE_URL='postgresql://fithub:fithub_local_only@127.0.0.1:54329/fithub_test?schema=public' \
DIRECT_URL='postgresql://fithub:fithub_local_only@127.0.0.1:54329/fithub_test?schema=public' \
npm run dev:api
```

### 2.2. Frontend (Web)

```bash
npm run dev:web
```

### 2.3. Mobile

```bash
npm run dev:mobile
```

### 2.4. Database (Prisma Studio)

```bash
DATABASE_URL='postgresql://fithub:fithub_local_only@127.0.0.1:54329/fithub_test?schema=public' \
npx prisma studio --schema=backend/prisma/schema.prisma
```

## 3. Kết quả kiểm thử TC-005-001

**Kết quả: Đã kiểm thử thành công trên phiên bản code mới.**

- TC-005-001 được thực hiện lại và cho kết quả đạt yêu cầu.
- Trạng thái gói tập trên Mobile được hiển thị là **Chờ thanh toán**.
- Không ghi nhận thay đổi bất thường so với kết quả mong đợi của ca kiểm thử.

## 4. Rà soát các ca kiểm thử UC05 liên quan

Đã rà soát các ca kiểm thử UC05 có sử dụng màn hình thông tin gói tập vừa được chỉnh sửa. Kết quả rà soát không ghi nhận thay đổi ngoài dự kiến hoặc phát sinh lỗi khác trong phạm vi đã kiểm tra.

## 5. Kiểm tra và xử lý lỗi hiển thị SVG trên Mobile Web

### 5.1. Hiện tượng lỗi

Trong quá trình chạy Mobile Client trên trình duyệt Arc, Metro/Expo hiển thị thông báo `Web ERROR`. Stack trace chỉ đến thư viện `react-native-svg`, tại:

- `react-native-svg/lib/module/web/WebShape.js:74:25`
- `mobile-client/App.tsx:818:25`
- `mobile-client/App.tsx:902:12`

Lỗi xuất hiện khi ứng dụng render khu vực biểu đồ vòng tròn (Donut) thể hiện thời hạn gói tập.

### 5.2. Vị trí kiểm tra trong mã nguồn

Đoạn code liên quan nằm trong `mobile-client/App.tsx`, ở phần biểu đồ Donut. Cụ thể, phần tử `Circle` thứ ba sử dụng thuộc tính `strokeDasharray` để xác định độ dài nét vẽ biểu thị số ngày còn lại:

```tsx
<Circle
  cx={56}
  cy={56}
  r={43}
  fill="none"
  stroke={C.lime}
  strokeWidth={26}
  strokeDasharray={`${2 * Math.PI * 43 * (totalDays > 0 ? Math.max(0, Math.min(1, remainingDays / totalDays)) : 0)} ${2 * Math.PI * 43}`}
  rotation={-90}
  origin="56, 56"
/>
```

Stack trace xác định khu vực cần kiểm tra là phần render `Circle` nói trên. Tuy nhiên, thông báo lỗi gốc trong ảnh chưa hiển thị đầy đủ, vì vậy chưa thể khẳng định riêng thuộc tính `strokeDasharray` là nguyên nhân duy nhất.

### 5.3. Hướng điều chỉnh

Để chuẩn hóa dữ liệu truyền vào SVG và loại trừ vấn đề định dạng chuỗi, có thể truyền `strokeDasharray` dưới dạng mảng số thay vì chuỗi nội suy:

```tsx
<Circle
  cx={56}
  cy={56}
  r={43}
  fill="none"
  stroke={C.lime}
  strokeWidth={26}
  strokeDasharray={[
    2 * Math.PI * 43 *
      (totalDays > 0
        ? Math.max(0, Math.min(1, remainingDays / totalDays))
        : 0),
    2 * Math.PI * 43,
  ]}
  rotation={-90}
  origin="56, 56"
/>
```

Cách điều chỉnh này giữ nguyên cách tính tỷ lệ ngày còn lại, chỉ thay đổi kiểu dữ liệu được truyền vào `strokeDasharray`. Đây là hướng xử lý cần được kiểm tra lại trên môi trường chạy thực tế; không nên xem riêng thay đổi này là bằng chứng lỗi đã được khắc phục.

### 5.4. Các bước kiểm tra sau điều chỉnh

Sau khi cập nhật mã nguồn:

1. Lưu `mobile-client/App.tsx` và reload ứng dụng bằng phím `r` trong Terminal đang chạy Expo.
2. Tải lại trang Mobile Web trên Arc bằng `Cmd + R`.
3. Mở lại màn hình có biểu đồ Donut và kiểm tra biểu đồ có hiển thị đầy đủ, đúng tỷ lệ hay không.
4. Mở Developer Console trong Arc bằng `Option + Command + J`; kiểm tra thông báo lỗi màu đỏ liên quan đến `WebShape.js` hoặc `react-native-svg`.
5. Kiểm tra Terminal đang chạy Expo để xác nhận không còn lỗi render tương ứng.
6. Nếu dự án được kiểm tra trên Expo Go, mở cùng màn hình trên thiết bị để kiểm tra riêng kết quả trên môi trường này.

**Tiêu chí xác nhận:** Chỉ kết luận lỗi đã được khắc phục khi biểu đồ hiển thị bình thường sau khi reload và không còn lỗi SVG tương ứng trong Console/Terminal. Cần phân biệt kết quả Mobile Web trên Arc với kết quả chạy trên Expo Go.

**Trạng thái ghi nhận:** Đã xác định được vị trí phát sinh lỗi theo stack trace và vùng code cần kiểm tra. Cần cập nhật kết quả sau khi chạy lại phiên bản đã điều chỉnh để xác nhận lỗi đã được khắc phục.

## 6. Kết luận

Môi trường kiểm thử được thiết lập trên macOS 26.0 và sử dụng trình duyệt Arc. TC-005-001 đã được kiểm thử thành công trên code mới; các ca UC05 liên quan đến màn hình gói tập vừa chỉnh sửa cũng đã được rà soát và không phát hiện vấn đề phát sinh trong phạm vi kiểm tra.

Đối với lỗi hiển thị SVG trên Mobile Web, đã xác định được vị trí cần kiểm tra trong `mobile-client/App.tsx` và ghi nhận hướng điều chỉnh thuộc tính `strokeDasharray`. Kết quả khắc phục cần được xác nhận bằng việc chạy lại ứng dụng và kiểm tra Console/Terminal theo các bước ở Mục 5.4.
