import type { Metadata } from "next";
import Link from "next/link";
import {
	acknowledgeRecoveryCodesAction,
	beginTwoFactorAction,
	changePasswordAction,
	confirmTwoFactorAction,
	disableTwoFactorAction,
	logoutAction,
	regenerateRecoveryCodesAction,
} from "@/app/manage/actions";
import { OneTimeSecret } from "@/components/manage/one-time-secret";
import { type FlashParams, ManagePage } from "@/components/manage/shell";
import { TwoFactorSetup } from "@/components/manage/two-factor-setup";
import { buttonClass, Card, Field, inputClass } from "@/components/manage/ui";
import { SubmitButton } from "@/components/submit-button";
import { requireMember, returnPath } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/domain/status";
import { otpQrSvg } from "@/lib/otp-qr";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My Profile" };

export default async function AccountPage({
	searchParams,
}: {
	searchParams: Promise<FlashParams & { next?: string }>;
}) {
	const query = await searchParams;
	const { member, app, services } = await requireMember("viewer", undefined, {
		allowMissingTwoFactor: true,
	});
	const settings = await services.settings.get();
	const twoFactor = await services.twoFactor.status(
		member.id,
		settings.siteName,
	);
	const next = query.next ? returnPath(query.next) : undefined;
	return (
		<ManagePage
			title="My Profile"
			flash={query}
			health={app.store.health}
			actions={
				twoFactor.enabled && next ? (
					<Link href={next} className={buttonClass.secondary}>
						Continue
					</Link>
				) : undefined
			}
		>
			<Card title="Profile">
				<dl className="grid gap-2 text-sm sm:grid-cols-[120px_1fr]">
					<dt className="text-muted">Name</dt>
					<dd>{member.name}</dd>
					<dt className="text-muted">Email</dt>
					<dd>{member.email}</dd>
					<dt className="text-muted">Role</dt>
					<dd>{ROLE_LABELS[member.role]}</dd>
				</dl>
			</Card>
			<Card
				title="Two-factor authentication"
				description="Use an authenticator app or a password manager."
			>
				{
					await TwoFactorSection({
						enabled: twoFactor.enabled,
						required: settings.requireTwoFactor,
						unreadable: twoFactor.unreadable === true,
						setup: twoFactor.setup,
						recoveryCodes: twoFactor.recoveryCodes,
						recoveryCodesRemaining: twoFactor.recoveryCodesRemaining,
						next: next ?? "",
					})
				}
			</Card>
			<Card title="Change password">
				<form action={changePasswordAction} className="max-w-sm space-y-4">
					<Field label="Current password" htmlFor="currentPassword">
						<input
							id="currentPassword"
							name="currentPassword"
							type="password"
							autoComplete="current-password"
							required
							className={inputClass}
						/>
					</Field>
					<Field
						label="New password"
						htmlFor="newPassword"
						hint="At least 8 characters."
					>
						<input
							id="newPassword"
							name="newPassword"
							type="password"
							autoComplete="new-password"
							minLength={8}
							required
							className={inputClass}
						/>
					</Field>
					<SubmitButton className={buttonClass.primary}>
						Update password
					</SubmitButton>
				</form>
			</Card>
			<form action={logoutAction}>
				<SubmitButton className={buttonClass.secondary}>Sign out</SubmitButton>
			</form>
		</ManagePage>
	);
}

async function TwoFactorSection({
	enabled,
	required,
	unreadable,
	setup,
	recoveryCodes,
	recoveryCodesRemaining,
	next,
}: {
	enabled: boolean;
	required: boolean;
	unreadable: boolean;
	setup?: { secret: string; uri: string };
	recoveryCodes?: string[];
	recoveryCodesRemaining: number;
	next: string;
}) {
	if (unreadable) {
		return (
			<p role="alert" className="text-sm text-major">
				The server cannot read the authenticator secret. Check ENCRYPTION_KEY.
			</p>
		);
	}
	if (setup) {
		return (
			<form action={confirmTwoFactorAction} className="max-w-sm space-y-4">
				<input type="hidden" name="next" value={next} />
				<TwoFactorSetup
					secret={setup.secret}
					uri={setup.uri}
					qrSvg={await otpQrSvg(setup.uri)}
				/>
				<Field label="Code from the app" htmlFor="code">
					<input
						id="code"
						name="code"
						autoComplete="one-time-code"
						required
						className={inputClass}
					/>
				</Field>
				<SubmitButton className={buttonClass.primary}>
					Turn on two-factor authentication
				</SubmitButton>
			</form>
		);
	}
	if (!enabled) {
		return (
			<form action={beginTwoFactorAction} className="space-y-4">
				<input type="hidden" name="next" value={next} />
				<p className="text-sm text-muted">
					Add a code from your password manager at each sign-in.
					{required ? " An admin requires two-factor authentication." : ""}
				</p>
				<SubmitButton className={buttonClass.primary}>
					Set up authenticator
				</SubmitButton>
			</form>
		);
	}
	return (
		<div className="space-y-6">
			<p className="text-sm">
				Two-factor authentication is on. Recovery codes left:{" "}
				{recoveryCodesRemaining}.
			</p>
			{recoveryCodes ? (
				<div className="space-y-4">
					<OneTimeSecret
						label="Save these recovery codes. Each code works one time."
						value={recoveryCodes.join("\n")}
					/>
					<ul className="grid gap-1 font-mono text-sm sm:grid-cols-2">
						{recoveryCodes.map((code) => (
							<li key={code}>{code}</li>
						))}
					</ul>
					<form action={acknowledgeRecoveryCodesAction}>
						<input type="hidden" name="next" value={next} />
						<SubmitButton className={buttonClass.secondary}>
							Hide recovery codes
						</SubmitButton>
					</form>
				</div>
			) : null}
			<form
				action={regenerateRecoveryCodesAction}
				className="max-w-sm space-y-4"
			>
				<input type="hidden" name="next" value={next} />
				<Field
					label="Current password"
					htmlFor="regeneratePassword"
					hint="New codes replace the old codes."
				>
					<input
						id="regeneratePassword"
						name="password"
						type="password"
						autoComplete="current-password"
						required
						className={inputClass}
					/>
				</Field>
				<SubmitButton className={buttonClass.secondary}>
					Create new recovery codes
				</SubmitButton>
			</form>
			{required ? (
				<p className="text-sm text-muted">
					An admin requires two-factor authentication.
				</p>
			) : (
				<form action={disableTwoFactorAction} className="max-w-sm space-y-4">
					<input type="hidden" name="next" value={next} />
					<Field label="Current password" htmlFor="disablePassword">
						<input
							id="disablePassword"
							name="password"
							type="password"
							autoComplete="current-password"
							required
							className={inputClass}
						/>
					</Field>
					<Field label="Authentication code" htmlFor="disableCode">
						<input
							id="disableCode"
							name="code"
							autoComplete="one-time-code"
							required
							className={inputClass}
						/>
					</Field>
					<SubmitButton className={buttonClass.danger}>
						Turn off two-factor authentication
					</SubmitButton>
				</form>
			)}
		</div>
	);
}
