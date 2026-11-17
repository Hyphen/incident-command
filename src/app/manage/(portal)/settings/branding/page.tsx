import type { Metadata } from "next";
import { updateBrandingAction } from "@/app/manage/actions";
import { LogoImage } from "@/components/logo-image";
import { SettingsTabs } from "@/components/manage/settings-tabs";
import { type FlashParams, ManagePage } from "@/components/manage/shell";
import { buttonClass, Card, Field, inputClass } from "@/components/manage/ui";
import { SubmitButton } from "@/components/submit-button";
import { requireMember } from "@/lib/auth";
import { publicFaviconSrc, publicLogoSrc } from "@/lib/brand";
import { BRAND_ASSET_TYPES } from "@/lib/domain/brand-asset";
import { THEMES } from "@/lib/theme";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Branding" };

const fileInputClass = `${inputClass} file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-surface-muted file:px-3 file:py-1 file:text-sm file:font-medium file:text-fg`;

/** The days of the small uptime history in a theme preview. */
const PREVIEW_DAYS = Array.from({ length: 24 }, (_, day) => ({
	day,
	color:
		day === 13 ? "bg-degraded" : day === 19 ? "bg-major" : "bg-operational",
}));

/**
 * A small status card that shows the colors, the corners and the font of a
 * theme. It takes the tokens from the `data-theme` of its parent.
 */
function ThemePreview() {
	return (
		<span
			aria-hidden
			className="block rounded-card border border-border bg-surface p-2.5"
		>
			<span className="flex items-center gap-2">
				<span className="size-2 shrink-0 rounded-full bg-operational" />
				<span className="text-xs font-semibold">Operational</span>
				<span className="ml-auto h-3.5 w-9 rounded-full bg-brand" />
			</span>
			<span className="mt-2.5 flex h-4 gap-[2px]">
				{PREVIEW_DAYS.map((bar) => (
					<span key={bar.day} className={`flex-1 rounded-[1px] ${bar.color}`} />
				))}
			</span>
		</span>
	);
}

/** A file field for the logo or the favicon. It shows the stored file and a control to remove it. */
function BrandAssetField({
	kind,
	label,
	hint,
	src,
	previewClass,
}: {
	kind: "logo" | "favicon";
	label: string;
	hint: string;
	/** The route of the stored file, when the admin uploaded one. */
	src: string | undefined;
	previewClass: string;
}) {
	const removeName = kind === "logo" ? "removeLogo" : "removeFavicon";
	return (
		<div>
			<Field label={label} htmlFor={kind} hint={hint}>
				{src ? (
					<LogoImage
						src={src}
						alt={`The current ${kind}`}
						className={`mb-3 object-contain ${previewClass}`}
					/>
				) : null}
				<input
					id={kind}
					name={kind}
					type="file"
					accept={BRAND_ASSET_TYPES[kind].join(",")}
					className={fileInputClass}
				/>
			</Field>
			{src ? (
				<label className="mt-3 flex items-center gap-2 text-sm">
					<input type="checkbox" name={removeName} />
					Remove the uploaded {kind}
				</label>
			) : null}
		</div>
	);
}

export default async function BrandingPage({
	searchParams,
}: {
	searchParams: Promise<FlashParams>;
}) {
	const flash = await searchParams;
	const { services, app } = await requireMember("admin");
	const settings = await services.settings.get();
	return (
		<ManagePage title="Settings" flash={flash} health={app.store.health}>
			<SettingsTabs active="branding" />
			<form action={updateBrandingAction} className="space-y-6">
				<Card
					title="Branding"
					description="Pick a theme, upload a logo and a favicon, then set a brand color and add custom CSS."
				>
					<fieldset>
						<legend className="mb-2 text-sm font-medium">Theme</legend>
						<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
							{THEMES.map((theme) => (
								<label
									key={theme.id}
									data-theme={theme.id}
									className="cursor-pointer rounded-card border border-border bg-bg p-3 font-sans text-fg has-checked:ring-2 has-checked:ring-brand"
								>
									<input
										type="radio"
										name="theme"
										value={theme.id}
										defaultChecked={settings.theme === theme.id}
										className="sr-only"
									/>
									<ThemePreview />
									<span className="mt-3 block text-sm font-medium">
										{theme.name}
									</span>
									<span className="block text-xs text-muted">
										{theme.description}
									</span>
								</label>
							))}
						</div>
					</fieldset>
					<div className="mt-4 grid gap-4 sm:grid-cols-2">
						<BrandAssetField
							kind="logo"
							label="Logo"
							hint="A PNG, JPEG, WebP, GIF or SVG file. The maximum size is 512 KB."
							src={publicLogoSrc(settings)}
							previewClass="h-8 w-auto max-w-48"
						/>
						<BrandAssetField
							kind="favicon"
							label="Favicon"
							hint="An ICO, PNG, JPEG, WebP, GIF or SVG file. The maximum size is 512 KB."
							src={publicFaviconSrc(settings)}
							previewClass="size-8"
						/>
					</div>
					<p className="mt-2 text-xs text-muted">
						The app stores each file in the database and keeps a copy in memory.
						The status page shows them when your website is down.
					</p>
					<div className="mt-4 sm:max-w-xs">
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
