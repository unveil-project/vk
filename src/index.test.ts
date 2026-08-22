import type { GitHubEvent, IdentifyResult } from "@unveil/identity";
import { identify } from "@unveil/identity";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { analyze } from "./index";

vi.mock("@unveil/identity", () => ({
	identify: vi.fn(),
}));

function createEvent(id: string): GitHubEvent {
	return { id, type: "PushEvent" } as unknown as GitHubEvent;
}

function jsonResponse(body: unknown, init?: ResponseInit): Response {
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: { "Content-Type": "application/json" },
		...init,
	});
}

const user = { login: "octocat", id: 2 };
const analysis = { classification: "human" } as unknown as IdentifyResult;

const fetchMock = vi.fn<typeof fetch>();

function eventsFor(url: string): GitHubEvent[] {
	const page = new URL(url).searchParams.get("page");
	return [createEvent(`page-${page}`)];
}

function requestsTo(path: string): Request[] {
	return fetchMock.mock.calls
		.map(([input, init]) => new Request(input as string, init))
		.filter((request) => new URL(request.url).pathname === path);
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.stubGlobal("fetch", fetchMock);

	fetchMock.mockImplementation((input) => {
		const url = String(input);

		if (new URL(url).pathname.endsWith("/events/public")) {
			return Promise.resolve(jsonResponse(eventsFor(url)));
		}

		return Promise.resolve(jsonResponse(user));
	});

	vi.mocked(identify).mockReturnValue(analysis);
});

describe("analyze", () => {
	it("authenticates with the given token", async () => {
		await analyze("octocat", { token: "secret" });

		for (const request of requestsTo("/users/octocat")) {
			expect(request.headers.get("Authorization")).toBe("Bearer secret");
		}
	});

	it("sends no authorization header when no token is given", async () => {
		await analyze("octocat");

		for (const request of fetchMock.mock.calls.map(
			([input, init]) => new Request(input as string, init),
		)) {
			expect(request.headers.get("Authorization")).toBeNull();
		}
	});

	it("looks up the user by username", async () => {
		await analyze("octocat");

		expect(requestsTo("/users/octocat")).toHaveLength(1);
	});

	it("escapes the username in the request url", async () => {
		await analyze("oct cat");

		expect(fetchMock.mock.calls[0]?.[0]).toBe(
			"https://api.github.com/users/oct%20cat",
		);
	});

	it("requests every allowed page of public events", async () => {
		await analyze("octocat");

		const urls = requestsTo("/users/octocat/events/public").map(
			(request) => request.url,
		);

		expect(urls).toHaveLength(3);
		for (const page of [1, 2, 3]) {
			expect(urls).toContain(
				`https://api.github.com/users/octocat/events/public?per_page=100&page=${page}`,
			);
		}
	});

	it("passes the user and the flattened events to identify", async () => {
		await analyze("octocat");

		expect(identify).toHaveBeenCalledWith({
			user,
			events: [
				createEvent("page-1"),
				createEvent("page-2"),
				createEvent("page-3"),
			],
		});
	});

	it("returns the analysis, the total event count and the user id", async () => {
		const result = await analyze("octocat");

		expect(result.analysis).toBe(analysis);
		expect(result.userId).toBe(2);
		expect(result.eventsCount).toBe(3);
	});

	it("omits the events unless showEvents is set", async () => {
		const result = await analyze("octocat");

		expect(result.events).toEqual([]);
		expect(result.eventsCount).toBe(3);
	});

	it("returns the events when showEvents is set", async () => {
		const result = await analyze("octocat", { showEvents: true });

		expect(result.events).toEqual([
			createEvent("page-1"),
			createEvent("page-2"),
			createEvent("page-3"),
		]);
	});

	it("counts events across pages of different sizes", async () => {
		const pages: Record<string, GitHubEvent[]> = {
			"1": [createEvent("a"), createEvent("b")],
			"2": [createEvent("c")],
			"3": [],
		};

		fetchMock.mockImplementation((input) => {
			const url = new URL(String(input));

			if (url.pathname.endsWith("/events/public")) {
				return Promise.resolve(
					jsonResponse(pages[url.searchParams.get("page") as string]),
				);
			}

			return Promise.resolve(jsonResponse(user));
		});

		const result = await analyze("octocat", { showEvents: true });

		expect(result.eventsCount).toBe(3);
		expect(result.events).toEqual([
			createEvent("a"),
			createEvent("b"),
			createEvent("c"),
		]);
	});

	it("handles a user with no public events", async () => {
		fetchMock.mockImplementation((input) =>
			Promise.resolve(
				jsonResponse(
					new URL(String(input)).pathname.endsWith("/events/public")
						? []
						: user,
				),
			),
		);

		const result = await analyze("octocat", { showEvents: true });

		expect(result.events).toEqual([]);
		expect(result.eventsCount).toBe(0);
		expect(identify).toHaveBeenCalledWith({ user, events: [] });
	});

	it("rejects when the user cannot be found", async () => {
		fetchMock.mockResolvedValue(
			jsonResponse({ message: "Not Found" }, { status: 404 }),
		);

		await expect(analyze("ghost")).rejects.toThrow("Not Found");
		expect(identify).not.toHaveBeenCalled();
	});

	it("exposes the status and url on the rejection", async () => {
		fetchMock.mockResolvedValue(
			jsonResponse({ message: "Not Found" }, { status: 404 }),
		);

		const error = await analyze("ghost").catch((reason) => reason);

		expect(error.name).toBe("GitHubError");
		expect(error.status).toBe(404);
		expect(error.url).toBe("https://api.github.com/users/ghost");
	});

	it("falls back to the status line when the error body is not json", async () => {
		fetchMock.mockResolvedValue(
			new Response("<html>nope</html>", {
				status: 502,
				statusText: "Bad Gateway",
			}),
		);

		await expect(analyze("octocat")).rejects.toThrow("502 Bad Gateway");
	});

	it("rejects when one of the event pages fails", async () => {
		fetchMock.mockImplementation((input) => {
			const url = new URL(String(input));

			if (!url.pathname.endsWith("/events/public")) {
				return Promise.resolve(jsonResponse(user));
			}

			if (url.searchParams.get("page") === "2") {
				return Promise.resolve(
					jsonResponse({ message: "API rate limit exceeded" }, { status: 403 }),
				);
			}

			return Promise.resolve(jsonResponse(eventsFor(String(input))));
		});

		await expect(analyze("octocat")).rejects.toThrow("API rate limit exceeded");
		expect(identify).not.toHaveBeenCalled();
	});
});
