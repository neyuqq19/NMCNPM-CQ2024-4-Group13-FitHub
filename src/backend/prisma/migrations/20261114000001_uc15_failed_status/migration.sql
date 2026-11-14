-- UC15: trạng thái FAILED cho lần thanh toán trực tuyến (VNPay) không thành công.
-- Tách migration riêng: PostgreSQL không cho dùng giá trị enum mới trong cùng
-- transaction đã thêm nó, nên ràng buộc dùng 'FAILED' nằm ở migration kế tiếp.
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'FAILED';
