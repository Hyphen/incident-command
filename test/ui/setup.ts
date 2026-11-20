import { setApp } from "@/lib/app";
import { resetNextState } from "./next-state";

// jsdom does not implement these methods. The browser uses them to open and
// close a dialog, so the tests use the same methods.
if (typeof HTMLDialogElement.prototype.showModal !== "function") {
	HTMLDialogElement.prototype.showModal = function showModal(
		this: HTMLDialogElement,
	) {
		this.open = true;
	};
}
if (typeof HTMLDialogElement.prototype.close !== "function") {
	HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
		this.open = false;
		this.dispatchEvent(new Event("close"));
	};
}

vi.mock("next/headers", async () => {
	const state = await import("./next-state");
	return {
		cookies: async () => state.cookieJar,
		headers: async () => state.requestHeaders,
	};
});

vi.mock("next/navigation", async (importOriginal) => {
	const actual = await importOriginal<typeof import("next/navigation")>();
	const state = await import("./next-state");
	return {
		unstable_isUnrecognizedActionError:
			actual.unstable_isUnrecognizedActionError,
		redirect: (url: string) => {
			throw new state.Redirect(url);
		},
		notFound: () => {
			throw new state.NotFound();
		},
		usePathname: () => state.pathname,
	};
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

afterEach(() => {
	resetNextState();
	setApp(undefined);
});
