"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { logoutAction } from "@/app/manage/actions";
import { ChevronDownIcon } from "@/components/icons";
import { SubmitButton } from "@/components/submit-button";
import { ROLE_LABELS } from "@/lib/domain/status";
import type { PublicMember } from "@/lib/domain/types";

/**
 * The signed-in member. A click opens the menu. The menu holds My Profile,
 * the status page, and sign out. Those actions stay out of the main navigation.
 */
export function UserMenu({ member }: { member: PublicMember }) {
	const [open, setOpen] = useState(false);
	const buttonRef = useRef<HTMLButtonElement>(null);
	const menuId = useId();
	const pathname = usePathname();
	const onProfile = pathname === "/manage/account";

	useEffect(() => {
		if (!open) return;
		const onPointerDown = (event: PointerEvent) => {
			const target = event.target;
			if (target instanceof Element && target.closest("[data-user-menu]")) {
				return;
			}
			setOpen(false);
		};
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			setOpen(false);
			// Return focus before the menu leaves the page.
			buttonRef.current?.focus();
		};
		document.addEventListener("pointerdown", onPointerDown);
		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("pointerdown", onPointerDown);
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [open]);

	const close = () => setOpen(false);

	return (
		<div
			data-user-menu
			className="relative border-t border-border px-3 py-3 lg:mt-6"
		>
			<button
				ref={buttonRef}
				type="button"
				aria-expanded={open}
				aria-haspopup="menu"
				aria-controls={menuId}
				onClick={() => setOpen((value) => !value)}
				className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-surface-muted ${
					onProfile ? "bg-surface-muted" : ""
				}`}
			>
				<span className="min-w-0 flex-1">
					<span className="block truncate text-sm font-medium">
						{member.name}
					</span>
					<span className="block truncate text-xs text-muted">
						{member.email} · {ROLE_LABELS[member.role]}
					</span>
				</span>
				<ChevronDownIcon
					className={`size-4 shrink-0 text-muted ${open ? "rotate-180" : ""}`}
				/>
			</button>
			{open ? (
				<div
					id={menuId}
					role="menu"
					aria-label="User"
					className="absolute top-full right-3 left-3 z-20 mt-1 rounded-lg border border-border bg-surface p-1 shadow-lg"
				>
					<Link
						role="menuitem"
						href="/manage/account"
						aria-current={onProfile ? "page" : undefined}
						onClick={close}
						className={`block rounded-lg px-3 py-2 text-sm ${
							onProfile
								? "bg-surface-muted font-medium text-fg"
								: "text-muted hover:bg-surface-muted hover:text-fg"
						}`}
					>
						My Profile
					</Link>
					<Link
						role="menuitem"
						href="/"
						onClick={close}
						className="block rounded-lg px-3 py-2 text-sm text-muted hover:bg-surface-muted hover:text-fg"
					>
						View status page
					</Link>
					<form action={logoutAction}>
						<SubmitButton
							role="menuitem"
							className="flex w-full items-center gap-1 rounded-lg px-3 py-2 text-left text-sm text-muted hover:bg-surface-muted hover:text-fg disabled:opacity-50"
						>
							Sign out
						</SubmitButton>
					</form>
				</div>
			) : null}
		</div>
	);
}
