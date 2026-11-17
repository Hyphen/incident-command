/** An operator logo or favicon. The src is the route of the uploaded file. */
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
		// biome-ignore lint/performance/noImgElement: the image is an uploaded file
		<img src={src} alt={alt} className={className} />
	);
}
