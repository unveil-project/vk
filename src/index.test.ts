import type { GitHubEvent, IdentifyResult } from "@unveil/identity";
import { identify } from "@unveil/identity";
import { Octokit } from "octokit";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { analyze } from "./index";

vi.mock("@unveil/identity", () => ({
	identify: vi.fn(),
}));

const getByUsername = vi.fn();
const listPublicEventsForUser = vi.fn();

vi.mock("octokit", () => ({
	Octokit: vi.fn(function Octokit() {
		return {
			rest: {
				users: { getByUsername },
				activity: { listPublicEventsForUser },
			},
		};
	}),
}));

function createEvent(id: string): GitHubEvent {
	return { id, type: "PushEvent" } as unknown as GitHubEvent;
}

const user = { login: "octocat" };
const analysis = { classification: "human" } as unknown as IdentifyResult;

beforeEach(() => {
	vi.clearAllMocks();

	getByUsername.mockResolvedValue({ data: user });
	listPublicEventsForUser.mockImplementation(({ page }: { page: number }) =>
		Promise.resolve({ data: [createEvent(`page-${page}`)] }),
	);
	vi.mocked(identify).mockReturnValue(analysis);
});

describe("analyze", () => {
	it("authenticates with the given token", async () => {
		await analyze("octocat", { token: "secret" });

		expect(Octokit).toHaveBeenCalledWith({ auth: "secret" });
	});

	it("creates an unauthenticated client when no token is given", async () => {
		await analyze("octocat");

		expect(Octokit).toHaveBeenCalledWith({ auth: undefined });
	});

	it("looks up the user by username", async () => {
		await analyze("octocat");

		expect(getByUsername).toHaveBeenCalledWith({ username: "octocat" });
	});

	it("requests every allowed page of public events", async () => {
		await analyze("octocat");

		expect(listPublicEventsForUser).toHaveBeenCalledTimes(3);
		for (const page of [1, 2, 3]) {
			expect(listPublicEventsForUser).toHaveBeenCalledWith({
				username: "octocat",
				per_page: 100,
				page,
			});
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

	it("returns the analysis and the total event count", async () => {
		const result = await analyze("octocat");

		expect(result.analysis).toBe(analysis);
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
		listPublicEventsForUser
			.mockResolvedValueOnce({ data: [createEvent("a"), createEvent("b")] })
			.mockResolvedValueOnce({ data: [createEvent("c")] })
			.mockResolvedValueOnce({ data: [] });

		const result = await analyze("octocat", { showEvents: true });

		expect(result.eventsCount).toBe(3);
		expect(result.events).toEqual([
			createEvent("a"),
			createEvent("b"),
			createEvent("c"),
		]);
	});

	it("handles a user with no public events", async () => {
		listPublicEventsForUser.mockResolvedValue({ data: [] });

		const result = await analyze("octocat", { showEvents: true });

		expect(result.events).toEqual([]);
		expect(result.eventsCount).toBe(0);
		expect(identify).toHaveBeenCalledWith({ user, events: [] });
	});

	it("rejects when the user cannot be found", async () => {
		getByUsername.mockRejectedValue(new Error("Not Found"));

		await expect(analyze("ghost")).rejects.toThrow("Not Found");
		expect(identify).not.toHaveBeenCalled();
	});

	it("rejects when one of the event pages fails", async () => {
		listPublicEventsForUser.mockReset();
		listPublicEventsForUser
			.mockResolvedValueOnce({ data: [createEvent("a")] })
			.mockRejectedValueOnce(new Error("API rate limit exceeded"))
			.mockResolvedValueOnce({ data: [] });

		await expect(analyze("octocat")).rejects.toThrow("API rate limit exceeded");
		expect(identify).not.toHaveBeenCalled();
	});
});
