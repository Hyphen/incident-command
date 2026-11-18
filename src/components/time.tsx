"use client";

import { useEffect, useState } from "react";
import { formatDateTime, formatTime } from "@/lib/format";

const local = new Intl.DateTimeFormat(undefined, {
	month: "short",
	day: "numeric",
	year: "numeric",
	hour: "2-digit",
	minute: "2-digit",
	timeZoneName: "short",
});
const localTime = new Intl.DateTimeFormat(undefined, {
	hour: "2-digit",
	minute: "2-digit",
	timeZoneName: "short",
});

/**
 * Renders a timestamp in UTC on the server and switches to the viewer's
 * local time zone once hydrated. `timeOnly` shows the time without the date.
 */
export function LocalTime({
	iso,
	className,
	timeOnly = false,
}: {
	iso: string;
	className?: string;
	timeOnly?: boolean;
}) {
	const [text, setText] = useState(() =>
		timeOnly ? formatTime(iso) : formatDateTime(iso),
	);
	useEffect(() => {
		setText((timeOnly ? localTime : local).format(new Date(iso)));
	}, [iso, timeOnly]);
	return (
		<time dateTime={iso} className={className} suppressHydrationWarning>
			{text}
		</time>
	);
}
