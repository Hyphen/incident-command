"use client";

import { useEffect, useState } from "react";
import { formatDateTime, formatShortDateTime } from "@/lib/format";

const local = new Intl.DateTimeFormat(undefined, {
	month: "short",
	day: "numeric",
	year: "numeric",
	hour: "2-digit",
	minute: "2-digit",
	timeZoneName: "short",
});
const localShort = new Intl.DateTimeFormat(undefined, {
	month: "short",
	day: "numeric",
	hour: "2-digit",
	minute: "2-digit",
	timeZoneName: "short",
});

/**
 * Renders a timestamp in UTC on the server and switches to the viewer's
 * local time zone once hydrated. `short` shows the date without the year.
 */
export function LocalTime({
	iso,
	className,
	short = false,
}: {
	iso: string;
	className?: string;
	short?: boolean;
}) {
	const [text, setText] = useState(() =>
		short ? formatShortDateTime(iso) : formatDateTime(iso),
	);
	useEffect(() => {
		setText((short ? localShort : local).format(new Date(iso)));
	}, [iso, short]);
	return (
		<time dateTime={iso} className={className} suppressHydrationWarning>
			{text}
		</time>
	);
}
