import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { logoutAction, submitTwoFactorAction } from "@/app/manage/actions";
import { AuthLayout } from "@/components/manage/shell";
import { TwoFactorSetup } from "@/components/manage/two-factor-setup";
import { buttonClass, Field, Flash, inputClass } from "@/components/manage/ui";
import { SubmitButton } from "@/components/submit-button";
import { getApp } from "@/lib/app";
import {
	getMemberContext,
	loginPath,
	pendingLogin,
	returnPath,
} from "@/lib/auth";
import { resolveFlash } from "@/lib/flash";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Two-factor authentication" };

export default async function TwoFactorLoginPage({
	searchParams,
}: {
	searchParams: Promise<{ error?: string; notice?: string; next?: string }>;
}) {
	const query = await searchParams;
	const { error, notice } = resolveFlash(query);
	const next = query.next ?? "";
	const app = await getApp();
	const pending = await pendingLogin(app);
	if (!pending) {
		if (await getMemberContext()) {
			redirect(returnPath(next));
		}
		redirect(loginPath(next));
	}
	const enroll = pending.session.purpose === "enroll";
	const settings = await app.services.settings.get();
	const view = enroll
		? await app.services.twoFactor.status(pending.member.id, settings.siteName)
		: undefined;
	return (
		<AuthLayout
			settings={settings}
			title={
				enroll ? "Set up two-factor authentication" : "Check your authenticator"
			}
		>
			<form action={submitTwoFactorAction} className="space-y-4">
				<Flash notice={notice} error={error} />
				<input type="hidden" name="next" value={next} />
				{view?.unreadable ? (
					<p role="alert" className="text-sm text-major">
						The server cannot read the authenticator secret. Check
						ENCRYPTION_KEY.
					</p>
				) : view?.setup ? (
					<TwoFactorSetup secret={view.setup.secret} uri={view.setup.uri} />
				) : enroll ? (
					<p className="text-sm text-muted">
						Start again from the sign-in page.
					</p>
				) : (
					<p className="text-sm text-muted">
						Enter the code from your authenticator app, or enter a recovery
						code.
					</p>
				)}
				{view?.unreadable || (enroll && !view?.setup) ? null : (
					<>
						<Field label="Authentication code" htmlFor="code">
							<input
								id="code"
								name="code"
								autoComplete="one-time-code"
								required
								className={inputClass}
							/>
						</Field>
						<SubmitButton className={`${buttonClass.primary} w-full`}>
							{enroll ? "Turn on and continue" : "Continue"}
						</SubmitButton>
					</>
				)}
			</form>
			<form action={logoutAction} className="mt-4">
				<SubmitButton className={`${buttonClass.secondary} w-full`}>
					Use a different account
				</SubmitButton>
			</form>
		</AuthLayout>
	);
}
