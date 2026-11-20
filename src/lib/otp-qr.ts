import { QrBit } from "qrbit";

/** An SVG QR code for an otpauth link. */
export async function otpQrSvg(uri: string): Promise<string> {
	const qr = new QrBit({
		text: uri,
		size: 200,
		margin: 16,
		backgroundColor: "#FFFFFF",
		foregroundColor: "#000000",
		errorCorrection: "M",
		cache: false,
	});
	return qr.toSvg({ cache: false });
}
