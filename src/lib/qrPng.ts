import QRCode from "qrcode";

/**
 * PNG for display/print. margin=4 modules = minimum quiet zone for reliable scans.
 * High width keeps edges sharp when printed small.
 */
export async function qrPngBuffer(data: string): Promise<Buffer> {
  return QRCode.toBuffer(data, {
    type: "png",
    width: 900,
    margin: 4,
    errorCorrectionLevel: "M",
    color: {
      dark: "#000000",
      light: "#FFFFFF"
    }
  });
}
