import { OneTimeSecret } from "./one-time-secret";

/** The QR code, the authenticator key, and the link a password manager imports. */
export function TwoFactorSetup({
	secret,
	uri,
	qrSvg,
}: {
	secret: string;
	uri: string;
	qrSvg: string;
}) {
	const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg)}`;
	return (
		<div className="space-y-4">
			{/* biome-ignore lint/performance/noImgElement: the image is a generated SVG */}
			<img
				src={src}
				alt="QR code for your authenticator app"
				width={200}
				height={200}
			/>
			<p className="text-sm text-muted">
				Scan this code with your password manager, or enter this key.
			</p>
			<OneTimeSecret label="Authenticator key" value={secret} />
			<OneTimeSecret label="Authenticator link" value={uri} />
		</div>
	);
}
