"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { logoutAction } from "@/app/manage/actions";
import { ChevronDownIcon, LogOutIcon } from "@/components/icons";
import { SubmitButton } from "@/components/submit-button";
import { ROLE_LABELS } from "@/lib/domain/status";
import type { PublicMember } from "@/lib/domain/types";

/**
 * The signed-in member. A click opens a small menu above the button on a
 * large screen, and below it on a small screen. The menu holds My Profile
 * and sign out.
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
		<div className="border-t border-border px-3 py-3 lg:mt-auto lg:shrink-0">
			<div data-user-menu className="relative">
				<button
					ref={buttonRef}
					type="button"
					aria-expanded={open}
					aria-haspopup="menu"
					aria-controls={menuId}
					onClick={() => setOpen((value) => !value)}
					className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-surface-muted ${
						open || onProfile ? "bg-surface-muted" : ""
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
					{/* The chevron points to the side where the menu opens. */}
					<ChevronDownIcon
						className={`size-4 shrink-0 text-muted ${
							open ? "rotate-180 lg:rotate-0" : "lg:rotate-180"
						}`}
					/>
				</button>
				{open ? (
					// The menu opens down on a small screen and up on a large screen.
					<div
						id={menuId}
						role="menu"
						aria-label="User"
						className="absolute top-full right-0 z-20 mt-1 w-56 border border-border bg-surface-muted shadow-lg lg:top-auto lg:bottom-full lg:left-0 lg:mt-0 lg:mb-1 lg:w-auto"
					>
						<Link
							role="menuitem"
							href="/manage/account"
							aria-current={onProfile ? "page" : undefined}
							onClick={close}
							className={`block px-3 py-2 text-sm focus-visible:-outline-offset-2 ${
								onProfile
									? "bg-surface-muted font-medium text-fg"
									: "text-fg hover:bg-surface"
							}`}
						>
							My Profile
						</Link>
						<hr className="my-0 border-border" />
						<form action={logoutAction}>
							<SubmitButton
								role="menuitem"
								className="group flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-fg hover:bg-surface focus-visible:-outline-offset-2 disabled:opacity-50"
							>
								<span className="order-first flex-1">Sign out</span>
								{/* The spinner replaces the icon when the form is busy. */}
								<LogOutIcon className="size-4 shrink-0 text-muted group-hover:text-fg group-aria-busy:hidden" />
							</SubmitButton>
						</form>
					</div>
				) : null}
			</div>
		</div>
	);
}
