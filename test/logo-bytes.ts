/** A 1x1 PNG. */
export const PNG_LOGO = Uint8Array.from(
	Buffer.from(
		"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
		"base64",
	),
);

export const JPEG_LOGO = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);

export const GIF_LOGO = Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);

export const WEBP_LOGO = Uint8Array.from([
	0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);

/** A RIFF file that is not a WebP image. */
export const RIFF_WAVE = Uint8Array.from([
	0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
]);

export const SVG_LOGO = new TextEncoder().encode(
	'<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>',
);

export const SVG_SCRIPT = new TextEncoder().encode(
	'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
);
