import dns, { type LookupAddress, type LookupOptions } from "node:dns";
import {
	assertPublicUrl,
	isPrivateAddress,
	PrivateAddressError,
	publicLookup,
} from "@/lib/notifications/private-network";

describe("isPrivateAddress", () => {
	it.each([
		"0.0.0.0",
		"10.1.2.3",
		"100.64.0.1",
		"127.0.0.1",
		"169.254.169.254",
		"172.16.5.4",
		"172.31.255.255",
		"192.168.1.1",
		"198.18.0.1",
		"224.0.0.1",
		"255.255.255.255",
		"::",
		"::1",
		"fe80::1",
		"fd00::1",
		"ff02::1",
		"2001:db8::1",
		"::ffff:10.0.0.1",
		"::ffff:7f00:1",
		// NAT64 addresses carry an IPv4 address: 169.254.169.254, 0.0.0.1 and 0.0.0.0.
		"64:ff9b::a9fe:a9fe",
		"64:ff9b::1",
		"64:ff9b::",
		"localhost",
	])("treats %s as private", (address) => {
		expect(isPrivateAddress(address)).toBe(true);
	});

	it.each([
		"8.8.8.8",
		"1.1.1.1",
		"172.32.0.1",
		"2606:4700:4700::1111",
		"::ffff:8.8.8.8",
		"64:ff9b::808:808",
	])("treats %s as public", (address) => {
		expect(isPrivateAddress(address)).toBe(false);
	});
});

describe("assertPublicUrl", () => {
	it("refuses a URL with a private IP address as its host", () => {
		for (const url of [
			"http://127.0.0.1:8080/hook",
			"http://[::1]/hook",
			// The URL parser reads 2130706433 as 127.0.0.1.
			"http://2130706433/hook",
			"https://10.0.0.5/hook",
		]) {
			expect(() => assertPublicUrl(url)).toThrow(PrivateAddressError);
		}
		expect(() => assertPublicUrl("http://10.0.0.5/")).toThrow(
			"10.0.0.5 is a private network address",
		);
	});

	it("leaves host names to the lookup and accepts public IP addresses", () => {
		expect(() => assertPublicUrl("https://hooks.example.com/x")).not.toThrow();
		expect(() => assertPublicUrl("https://8.8.8.8/x")).not.toThrow();
	});
});

describe("publicLookup", () => {
	const lookup = (host: string, options: LookupOptions) =>
		new Promise<{ address: string | LookupAddress[]; family?: number }>(
			(resolve, reject) =>
				publicLookup(host, options, (error, address, family) =>
					error ? reject(error) : resolve({ address, family }),
				),
		);

	it("resolves a public address in the form that the caller asks for", async () => {
		await expect(lookup("8.8.8.8", { all: true })).resolves.toEqual({
			address: [{ address: "8.8.8.8", family: 4 }],
			family: undefined,
		});
		await expect(lookup("8.8.8.8", {})).resolves.toEqual({
			address: "8.8.8.8",
			family: 4,
		});
	});

	it("refuses a host name with a private address", async () => {
		await expect(lookup("localhost", { all: true })).rejects.toThrow(
			/^localhost resolves to .+, a private network address$/,
		);
	});

	it("forwards an error of the resolver", async () => {
		const failure = Object.assign(new Error("getaddrinfo ENOTFOUND nope"), {
			code: "ENOTFOUND",
		});
		vi.spyOn(dns, "lookup").mockImplementationOnce(((
			_host: string,
			_options: unknown,
			callback: (error: Error) => void,
		) => callback(failure)) as never);
		await expect(lookup("nope.example", { all: true })).rejects.toBe(failure);
	});
});
