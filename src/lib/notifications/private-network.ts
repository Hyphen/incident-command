import dns, { type LookupAddress } from "node:dns";
import { BlockList, isIP, type LookupFunction } from "node:net";
import { Agent } from "undici";

/**
 * Address ranges that are not on the public internet: this network,
 * private networks, shared address space, loopback, link-local,
 * documentation and benchmark ranges, multicast and reserved ranges.
 * BlockList also checks an IPv4-mapped IPv6 address against the IPv4 ranges.
 */
const PRIVATE_RANGES: readonly [string, number, "ipv4" | "ipv6"][] = [
	["0.0.0.0", 8, "ipv4"],
	["10.0.0.0", 8, "ipv4"],
	["100.64.0.0", 10, "ipv4"],
	["127.0.0.0", 8, "ipv4"],
	["169.254.0.0", 16, "ipv4"],
	["172.16.0.0", 12, "ipv4"],
	["192.0.0.0", 24, "ipv4"],
	["192.0.2.0", 24, "ipv4"],
	["192.88.99.0", 24, "ipv4"],
	["192.168.0.0", 16, "ipv4"],
	["198.18.0.0", 15, "ipv4"],
	["198.51.100.0", 24, "ipv4"],
	["203.0.113.0", 24, "ipv4"],
	["224.0.0.0", 4, "ipv4"],
	["240.0.0.0", 4, "ipv4"],
	["::", 128, "ipv6"],
	["::1", 128, "ipv6"],
	["100::", 64, "ipv6"],
	["2001::", 23, "ipv6"],
	["2001:db8::", 32, "ipv6"],
	["2002::", 16, "ipv6"],
	["fc00::", 7, "ipv6"],
	["fe80::", 10, "ipv6"],
	["fec0::", 10, "ipv6"],
	["ff00::", 8, "ipv6"],
];

const PRIVATE = new BlockList();
for (const [network, prefix, type] of PRIVATE_RANGES) {
	PRIVATE.addSubnet(network, prefix, type);
}

/** NAT64 addresses carry an IPv4 address in their last 32 bits. */
const NAT64 = new BlockList();
NAT64.addSubnet("64:ff9b::", 96, "ipv6");

/** The IPv4 address in the last 32 bits of an IPv6 address. */
function lastIpv4(address: string): string {
	// The URL parser writes an IPv6 address in one canonical form.
	const canonical = new URL(`http://[${address}]/`).hostname.slice(1, -1);
	// An empty group is zero, as in `64:ff9b::1`.
	const [high, low] = canonical.split(":").slice(-2) as [string, string];
	const value =
		(Number.parseInt(high, 16) || 0) * 0x10000 +
		(Number.parseInt(low, 16) || 0);
	return [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join(".");
}

/** True for an address that is not on the public internet, and for a value that is not an address. */
export function isPrivateAddress(address: string): boolean {
	switch (isIP(address)) {
		case 4:
			return PRIVATE.check(address, "ipv4");
		case 6:
			return NAT64.check(address, "ipv6")
				? isPrivateAddress(lastIpv4(address))
				: PRIVATE.check(address, "ipv6");
		default:
			return true;
	}
}

/** A webhook URL that leads to a private network address. */
export class PrivateAddressError extends Error {
	constructor(host: string, address: string) {
		super(
			host === address
				? `${address} is a private network address`
				: `${host} resolves to ${address}, a private network address`,
		);
		this.name = "PrivateAddressError";
	}
}

/**
 * Throws `PrivateAddressError` for a URL with a private IP address as its
 * host. A connection to an IP address does not use `publicLookup`, so this
 * check must come before the request.
 */
export function assertPublicUrl(url: string): void {
	const host = new URL(url).hostname.replace(/^\[(.*)\]$/, "$1");
	if (isIP(host) && isPrivateAddress(host)) {
		throw new PrivateAddressError(host, host);
	}
}

/**
 * Resolves a host name like `dns.lookup`, but fails when one of the
 * addresses is private. The connection uses the address that this lookup
 * checked, so a second DNS answer cannot lead it to a private address.
 */
export const publicLookup: LookupFunction = (hostname, options, callback) => {
	dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
		if (error) {
			callback(error, []);
			return;
		}
		const blocked = addresses.find(({ address }) => isPrivateAddress(address));
		if (blocked) {
			callback(new PrivateAddressError(hostname, blocked.address), []);
			return;
		}
		if (options.all) {
			callback(null, addresses);
			return;
		}
		const [first] = addresses as [LookupAddress];
		callback(null, first.address, first.family);
	});
};

let dispatcher: Agent | undefined;

/** The `fetch` dispatcher that connects only to public addresses. */
export function publicDispatcher(): Agent {
	dispatcher ??= new Agent({ connect: { lookup: publicLookup } });
	return dispatcher;
}
