import { ValidationError } from "../errors";
import type { BrandAssetKind } from "./types";

/** The largest logo or favicon an admin can upload. */
export const BRAND_ASSET_MAX_BYTES = 512 * 1024;

/** The messages for a file that the service does not accept. */
export const BRAND_ASSET_MESSAGES = {
	logo: {
		type: "Use a PNG, JPEG, WebP, GIF or SVG logo.",
		size: "The logo must be 512 KB or smaller.",
		svg: "This SVG logo is not allowed.",
	},
	favicon: {
		type: "Use an ICO, PNG, JPEG, WebP, GIF or SVG favicon.",
		size: "The favicon must be 512 KB or smaller.",
		svg: "This SVG favicon is not allowed.",
	},
} as const satisfies Record<BrandAssetKind, Record<string, string>>;

const IMAGE_TYPES = [
	"image/png",
	"image/jpeg",
	"image/webp",
	"image/gif",
	"image/svg+xml",
] as const;

/** The content types that each file can have. Only a favicon can be an ICO file. */
export const BRAND_ASSET_TYPES: Record<BrandAssetKind, readonly string[]> = {
	logo: IMAGE_TYPES,
	favicon: ["image/x-icon", ...IMAGE_TYPES],
};

const PNG = [0x89, 0x50, 0x4e, 0x47] as const;
const JPEG = [0xff, 0xd8, 0xff] as const;
const GIF = [0x47, 0x49, 0x46, 0x38] as const;
const RIFF = [0x52, 0x49, 0x46, 0x46] as const;
const WEBP = [0x57, 0x45, 0x42, 0x50] as const;
const ICO = [0x00, 0x00, 0x01, 0x00] as const;

/** Rejects SVG that can run script when the browser opens the file directly. */
const UNSAFE_SVG =
	/<\s*script\b|javascript:|<\s*foreignObject\b|<\s*iframe\b|<\s*embed\b|<\s*object\b|<\s*!ENTITY\b|\bon[a-z]+\s*=/i;

/** The message for text that is not base64 and not the source of an SVG image. */
export const BRAND_ASSET_ENCODING_MESSAGE =
	"Send the file as base64 text or as the source of an SVG image.";

const DATA_URL_PREFIX = /^data:[^,]*;base64,/i;
const BASE64 = /^[A-Za-z0-9+/_-]+={0,2}$/;

/**
 * Reads the bytes of a file that an agent sends as text.
 * The text is base64, a base64 data URL, or the source of an SVG image.
 */
export function decodeBrandAsset(data: string): Uint8Array {
	const text = data.trim();
	if (text.startsWith("<")) {
		return new TextEncoder().encode(text);
	}
	const base64 = text.replace(DATA_URL_PREFIX, "").replace(/\s+/g, "");
	if (!BASE64.test(base64)) {
		throw new ValidationError(BRAND_ASSET_ENCODING_MESSAGE);
	}
	return Uint8Array.from(Buffer.from(base64, "base64"));
}

/**
 * Checks that bytes are a small image of a type that the logo or favicon accepts.
 * An SVG must not contain a script or an event handler.
 */
export function inspectBrandAsset(
	kind: BrandAssetKind,
	bytes: Uint8Array,
): { contentType: string } {
	const messages = BRAND_ASSET_MESSAGES[kind];
	if (bytes.byteLength === 0) {
		throw new ValidationError(messages.type);
	}
	if (bytes.byteLength > BRAND_ASSET_MAX_BYTES) {
		throw new ValidationError(messages.size);
	}
	const contentType = sniff(bytes);
	if (!contentType || !BRAND_ASSET_TYPES[kind].includes(contentType)) {
		throw new ValidationError(messages.type);
	}
	if (contentType === "image/svg+xml" && isUnsafeSvg(bytes)) {
		throw new ValidationError(messages.svg);
	}
	return { contentType };
}

function sniff(bytes: Uint8Array): string | undefined {
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
	if (hasPrefix(bytes, ICO)) {
		return "image/x-icon";
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

function isUnsafeSvg(bytes: Uint8Array): boolean {
	const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
	return UNSAFE_SVG.test(text);
}
