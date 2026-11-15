import { AirhornSendType } from "airhorn";
import { TWILIO_API, TwilioProvider } from "@/lib/notifications/twilio";

const ACCOUNT = `AC${"1".repeat(32)}`;

const message = (from: string) => ({
	to: "+15551234567",
	from,
	content: "API errors & timeouts",
	type: AirhornSendType.SMS,
});

function stubFetch(response: () => Response | Promise<Response>) {
	const calls: { url: string; init: RequestInit }[] = [];
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string, init: RequestInit) => {
			calls.push({ url: String(url), init });
			return response();
		}),
	);
	return calls;
}

const provider = () =>
	new TwilioProvider({ accountSid: ACCOUNT, authToken: "token" });

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("TwilioProvider", () => {
	it("posts the message as a form to the Messages API of the account", async () => {
		const calls = stubFetch(() =>
			Response.json({ sid: "SM1", status: "queued" }, { status: 201 }),
		);
		const result = await provider().send(message("+15550001111"));
		expect(result).toEqual({
			success: true,
			response: { status: 201, sid: "SM1" },
			errors: [],
		});
		const [call] = calls;
		expect(call?.url).toBe(`${TWILIO_API}/Accounts/${ACCOUNT}/Messages.json`);
		expect(call?.init.method).toBe("POST");
		expect(call?.init.headers).toEqual({
			authorization: `Basic ${btoa(`${ACCOUNT}:token`)}`,
			"content-type": "application/x-www-form-urlencoded",
		});
		expect(
			Object.fromEntries(new URLSearchParams(String(call?.init.body))),
		).toEqual({
			To: "+15551234567",
			From: "+15550001111",
			Body: "API errors & timeouts",
		});
	});

	it("gives the reason from Twilio, or only the status when the body is not JSON", async () => {
		stubFetch(() =>
			Response.json(
				{ code: 21211, message: "The 'To' number is not valid." },
				{ status: 400 },
			),
		);
		const rejected = await provider().send(message("ACME"));
		expect(rejected.success).toBe(false);
		expect(rejected.errors.map((error) => error.message)).toEqual([
			"Twilio responded with status 400: The 'To' number is not valid.",
		]);
		expect(rejected.response).toMatchObject({ status: 400 });

		stubFetch(() => new Response("<html>Bad gateway</html>", { status: 502 }));
		const gateway = await provider().send(message("ACME"));
		expect(gateway.errors.map((error) => error.message)).toEqual([
			"Twilio responded with status 502",
		]);
	});

	it("reports a failed request", async () => {
		stubFetch(() => Promise.reject(new TypeError("fetch failed")));
		const result = await provider().send(message("+15550001111"));
		expect(result.success).toBe(false);
		expect(result.errors.map((error) => error.message)).toEqual([
			"fetch failed",
		]);
	});

	it("needs a from number and does not call Twilio without one", async () => {
		const calls = stubFetch(() => new Response(null, { status: 201 }));
		const result = await provider().send(message(""));
		expect(result.errors.map((error) => error.message)).toEqual([
			"Twilio needs a from number",
		]);
		expect(calls).toEqual([]);
	});
});
