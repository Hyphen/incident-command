import { OneTimeSecret } from "./one-time-secret";

/** The authenticator key and the link a password manager imports. */
export function TwoFactorSetup({
	secret,
	uri,
}: {
	secret: string;
	uri: string;
}) {
	return (
		<div className="space-y-4">
			<p className="text-sm text-muted">
				Enter this key in your password manager or authenticator app.
			</p>
			<OneTimeSecret label="Authenticator key" value={secret} />
			<OneTimeSecret label="Authenticator link" value={uri} />
		</div>
	);
}
