"use client";

import { useState } from "react";
import { buttonClass } from "./ui";

/** Copies a value to the clipboard. The label changes to "Copied" after the copy. */
export function CopyButton({ value }: { value: string }) {
	const [copied, setCopied] = useState(false);
	const copy = async () => {
		await navigator.clipboard.writeText(value);
		setCopied(true);
	};
	return (
		<button type="button" onClick={copy} className={buttonClass.secondary}>
			{copied ? "Copied" : "Copy"}
		</button>
	);
}
