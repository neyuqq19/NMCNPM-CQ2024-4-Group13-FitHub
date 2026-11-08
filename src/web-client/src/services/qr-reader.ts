// Keep the camera decoder out of the initial application bundle.
export class QrReaderLoadError extends Error {
  constructor() {
    super(
      "Không tải được bộ quét QR. Kiểm tra kết nối với web rồi tải lại trang.",
    );
  }
}
export async function createQrReader() {
  const [{ BrowserQRCodeReader }, { DecodeHintType }] = await Promise.all([
    import("@zxing/browser"),
    import("@zxing/library"),
  ]).catch(() => {
    throw new QrReaderLoadError();
  });
  class CameraQrReader extends BrowserQRCodeReader {
    private crop = document.createElement("canvas");
    override decodeFromCanvas(canvas: HTMLCanvasElement) {
      try {
        return super.decodeFromCanvas(canvas);
      } catch (original) {
        // Local thresholding works better on a phone screen than on a frame
        // containing a bright display and a much darker room/background.
        const side = Math.floor(Math.min(canvas.width, canvas.height) * 0.8);
        if (!side) throw original;
        this.crop.width = this.crop.height = side;
        const context = this.crop.getContext("2d", {
          willReadFrequently: true,
        });
        if (!context) throw original;
        context.drawImage(
          canvas,
          (canvas.width - side) / 2,
          (canvas.height - side) / 2,
          side,
          side,
          0,
          0,
          side,
          side,
        );
        return super.decodeFromCanvas(this.crop);
      }
    }
  }
  return new CameraQrReader(new Map([[DecodeHintType.TRY_HARDER, true]]), {
    delayBetweenScanAttempts: 120,
    delayBetweenScanSuccess: 1000,
  });
}
