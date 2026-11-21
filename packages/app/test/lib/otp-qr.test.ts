import { QrBit } from "qrbit";
import { otpauthUri } from "@/lib/domain/totp";
import { otpQrSvg } from "@/lib/otp-qr";

/** RFC 6238 SHA1 secret `12345678901234567890`. */
const SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("otpQrSvg", () => {
	it("builds a QR code that scans as the otpauth link", async () => {
		const uri = otpauthUri({
			issuer: "Status",
			account: "ada@acme.dev",
			secret: SECRET,
		});
		const svg = await otpQrSvg(uri);
		expect(svg.startsWith("<svg")).toBe(true);
		expect(svg).not.toContain(SECRET);
		expect(await QrBit.decode(QrBit.convertSvgToPng(svg))).toBe(uri);
	});
});
