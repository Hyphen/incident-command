/** The product mark next to the "Powered by" credit. */
export function ProductMark() {
	return (
		// biome-ignore lint/performance/noImgElement: the mark is a static file in public
		<img
			src="/product-mark.png"
			alt=""
			width={16}
			height={16}
			className="size-4 shrink-0"
		/>
	);
}
