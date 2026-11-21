import { WatchtowerLogo } from "@/components/watchtower-logo";

/** The product credit at the bottom of a page. */
export function PoweredBy() {
	return (
		<span className="inline-flex items-center gap-1.5">
			<WatchtowerLogo />
			<span>
				Powered by{" "}
				<a
					href="https://github.com/jaredwray/incident-command"
					className="underline-offset-2 hover:underline"
				>
					Incident Command
				</a>
			</span>
		</span>
	);
}
