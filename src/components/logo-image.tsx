/** An operator logo. The src is a logo URL or the uploaded file route. */
export function LogoImage({
	src,
	alt,
	className,
}: {
	src: string;
	alt: string;
	className?: string;
}) {
	return (
		// biome-ignore lint/performance/noImgElement: logos are runtime URLs or uploaded files
		<img src={src} alt={alt} className={className} />
	);
}
