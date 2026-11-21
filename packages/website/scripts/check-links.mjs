// Checks the internal links of the built site.
//
//   node scripts/check-links.mjs [dist]
//
// The script reads each HTML file in the output folder (default: ./dist). It
// finds each href and src that starts with "/" and checks that the target file
// exists. A link to a heading must name an id on the target page. The script
// exits with 1 and lists each broken link.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2] ?? "dist");

/** Paths that exist only on the live site, for example after a release. */
const allowed = new Set(["/changelog/"]);

function htmlFiles(dir) {
	return readdirSync(dir).flatMap((name) => {
		const file = path.join(dir, name);
		if (statSync(file).isDirectory()) {
			return htmlFiles(file);
		}
		return file.endsWith(".html") ? [file] : [];
	});
}

/** The file that serves a URL path, or undefined. */
function target(urlPath) {
	const clean = decodeURIComponent(urlPath);
	const direct = path.join(root, clean);
	if (clean.endsWith("/")) {
		const index = path.join(direct, "index.html");
		return existsSync(index) ? index : undefined;
	}
	if (existsSync(direct) && statSync(direct).isFile()) {
		return direct;
	}
	const index = path.join(direct, "index.html");
	return existsSync(index) ? index : undefined;
}

const ids = new Map();
function idsOf(file) {
	if (!ids.has(file)) {
		const html = readFileSync(file, "utf8");
		ids.set(
			file,
			new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])),
		);
	}
	return ids.get(file);
}

const broken = [];
const files = htmlFiles(root);
for (const file of files) {
	const html = readFileSync(file, "utf8");
	const page = `/${path.relative(root, file).replace(/index\.html$/, "")}`;
	for (const match of html.matchAll(/\s(?:href|src)="(\/[^"]*)"/g)) {
		const link = match[1];
		if (link.startsWith("//")) {
			continue;
		}
		const [urlPath, hash] = link.split("#");
		if (allowed.has(urlPath)) {
			continue;
		}
		const found = target(urlPath);
		if (!found) {
			broken.push(`${page} → ${link} (no page)`);
		} else if (hash && found.endsWith(".html") && !idsOf(found).has(hash)) {
			broken.push(`${page} → ${link} (no heading)`);
		}
	}
}

if (broken.length > 0) {
	console.error(`Found ${broken.length} broken links:`);
	for (const line of [...new Set(broken)].sort()) {
		console.error(`  ${line}`);
	}
	process.exit(1);
}
console.log(`Checked the links of ${files.length} pages. No link is broken.`);
