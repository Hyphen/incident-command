import { ValidationError } from "../errors";

/** The largest logo an admin can upload. */
export const LOGO_MAX_BYTES = 512 * 1024;

export const LOGO_TYPE_MESSAGE = "Use a PNG, JPEG, WebP, GIF or SVG logo.";
export const LOGO_SIZE_MESSAGE = "The logo must be 512 KB or smaller.";
export const LOGO_SVG_MESSAGE = "This SVG logo is not allowed.";

const LOGO_CONTENT_TYPES = [
	"image/png",
	"image/jpeg",
	"image/webp",
	"image/gif",
	"image/svg+xml",
] as const;
export type LogoContentType = (typeof LOGO_CONTENT_TYPES)[number];

const PNG = [0x89, 0x50, 0x4e, 0x47] as const;
const JPEG = [0xff, 0xd8, 0xff] as const;
const GIF = [0x47, 0x49, 0x46, 0x38] as const;
const RIFF = [0x52, 0x49, 0x46, 0x46] as const;
const WEBP = [0x57, 0x45, 0x42, 0x50] as const;

/** Rejects SVG that can run script when the browser opens the file directly. */
const UNSAFE_SVG =
	/<\s*script\b|javascript:|<\s*foreignObject\b|<\s*iframe\b|<\s*embed\b|<\s*object\b|<\s*!ENTITY\b|\bon[a-z]+\s*=/i;

/**
 * Checks that bytes are a small PNG, JPEG, WebP, GIF or SVG logo.
 * An SVG must not contain a script or an event handler.
 */
export function inspectLogo(bytes: Uint8Array): {
	contentType: LogoContentType;
} {
	if (bytes.byteLength === 0) {
		throw new ValidationError(LOGO_TYPE_MESSAGE);
	}
	if (bytes.byteLength > LOGO_MAX_BYTES) {
		throw new ValidationError(LOGO_SIZE_MESSAGE);
	}
	const contentType = sniff(bytes);
	if (!contentType) {
		throw new ValidationError(LOGO_TYPE_MESSAGE);
	}
	if (contentType === "image/svg+xml") {
		assertSafeSvg(bytes);
	}
	return { contentType };
}

function sniff(bytes: Uint8Array): LogoContentType | undefined {
	if (hasPrefix(bytes, PNG)) {
		return "image/png";
	}
	if (hasPrefix(bytes, JPEG)) {
		return "image/jpeg";
	}
	if (hasPrefix(bytes, GIF)) {
		return "image/gif";
	}
	if (hasPrefix(bytes, RIFF) && hasPrefix(bytes.subarray(8), WEBP)) {
		return "image/webp";
	}
	if (isSvg(bytes)) {
		return "image/svg+xml";
	}
	return undefined;
}

function hasPrefix(bytes: Uint8Array, prefix: readonly number[]): boolean {
	if (bytes.length < prefix.length) {
		return false;
	}
	for (let index = 0; index < prefix.length; index++) {
		if (bytes[index] !== prefix[index]) {
			return false;
		}
	}
	return true;
}

function isSvg(bytes: Uint8Array): boolean {
	const head = new TextDecoder("utf-8", { fatal: false }).decode(
		bytes.subarray(0, 256),
	);
	return /<\s*svg\b/i.test(head);
}

function assertSafeSvg(bytes: Uint8Array): void {
	const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
	if (UNSAFE_SVG.test(text)) {
		throw new ValidationError(LOGO_SVG_MESSAGE);
	}
}
