import type { Metadata } from "next";
import { updateBrandingAction } from "@/app/manage/actions";
import { LogoImage } from "@/components/logo-image";
import { SettingsTabs } from "@/components/manage/settings-tabs";
import { type FlashParams, ManagePage } from "@/components/manage/shell";
import { buttonClass, Card, Field, inputClass } from "@/components/manage/ui";
import { SubmitButton } from "@/components/submit-button";
import { requireMember } from "@/lib/auth";
import { publicLogoSrc } from "@/lib/brand";
import { THEMES } from "@/lib/theme";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Branding" };

export default async function BrandingPage({
	searchParams,
}: {
	searchParams: Promise<FlashParams>;
}) {
	const flash = await searchParams;
	const { services, app } = await requireMember("admin");
	const settings = await services.settings.get();
	const logoSrc = publicLogoSrc(settings);
	return (
		<ManagePage title="Settings" flash={flash} health={app.store.health}>
			<SettingsTabs active="branding" />
			<form
				action={updateBrandingAction}
				encType="multipart/form-data"
				className="space-y-6"
			>
				<Card
					title="Branding"
					description="Pick a theme, then set a brand color, upload a logo and add custom CSS."
				>
					<fieldset>
						<legend className="mb-2 text-sm font-medium">Theme</legend>
						<div className="grid gap-3 sm:grid-cols-3">
							{THEMES.map((theme) => (
								<label
									key={theme.id}
									data-theme={theme.id}
									className="cursor-pointer rounded-card border border-border bg-bg p-3 text-fg has-checked:ring-2 has-checked:ring-brand"
								>
									<input
										type="radio"
										name="theme"
										value={theme.id}
										defaultChecked={settings.theme === theme.id}
										className="sr-only"
									/>
									<span className="flex gap-1" aria-hidden>
										<span className="size-4 rounded-full bg-brand" />
										<span className="size-4 rounded-full bg-operational" />
										<span className="size-4 rounded-full bg-degraded" />
										<span className="size-4 rounded-full bg-major" />
									</span>
									<span className="mt-2 block text-sm font-medium">
										{theme.name}
									</span>
									<span className="block text-xs text-muted">
										{theme.description}
									</span>
								</label>
							))}
						</div>
					</fieldset>
					<div className="mt-4">
						<Field
							label="Logo file"
							htmlFor="logo"
							hint="Upload a PNG, JPEG, WebP, GIF or SVG file up to 512 KB. The file replaces the logo URL."
						>
							{logoSrc ? (
								<LogoImage
									src={logoSrc}
									alt=""
									className="mb-3 h-8 w-auto max-w-48 object-contain"
								/>
							) : null}
							<input
								id="logo"
								name="logo"
								type="file"
								accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
								className={inputClass}
							/>
						</Field>
						{settings.logoUpdatedAt ? (
							<label className="mt-3 flex items-center gap-2 text-sm">
								<input type="checkbox" name="removeLogo" />
								Remove the uploaded logo
							</label>
						) : null}
					</div>
					<div className="mt-4 grid gap-4 sm:grid-cols-3">
						<Field
							label="Brand color"
							htmlFor="brandColor"
							hint="Hex, e.g. #4f46e5."
						>
							<input
								id="brandColor"
								name="brandColor"
								defaultValue={settings.brandColor}
								pattern="#[0-9a-fA-F]{6}"
								placeholder="#4f46e5"
								className={inputClass}
							/>
						</Field>
						<Field
							label="Logo URL"
							htmlFor="logoUrl"
							hint="The page uses this URL when no logo file is stored."
						>
							<input
								id="logoUrl"
								name="logoUrl"
								type="url"
								defaultValue={settings.logoUrl}
								className={inputClass}
							/>
						</Field>
						<Field label="Favicon URL" htmlFor="faviconUrl">
							<input
								id="faviconUrl"
								name="faviconUrl"
								type="url"
								defaultValue={settings.faviconUrl}
								className={inputClass}
							/>
						</Field>
					</div>
					<div className="mt-4">
						<Field
							label="Custom CSS"
							htmlFor="customCss"
							hint={
								<>
									Override any design token, e.g.{" "}
									<code>
										{
											":root { --ic-radius: 0; --ic-font: 'Inter', sans-serif; }"
										}
									</code>
								</>
							}
						>
							<textarea
								id="customCss"
								name="customCss"
								rows={6}
								defaultValue={settings.customCss}
								className={`${inputClass} font-mono`}
							/>
						</Field>
					</div>
				</Card>
				<SubmitButton className={buttonClass.primary}>
					Save branding
				</SubmitButton>
			</form>
		</ManagePage>
	);
}
