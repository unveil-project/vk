import {
	type GitHubEvent,
	type GitHubUser,
	type IdentifyResult,
	identify,
} from "@unveil/identity";

export type AnalyzeOptions = {
	token?: string;
	showEvents?: boolean;
};

export type AnalyzeReturn = {
	analysis: IdentifyResult;
	events: GitHubEvent[];
	eventsCount: number;
};

const API_URL = "https://api.github.com";

// This is the max amount of pages GitHub allows.
const MAX_PAGES = 3;
const PER_PAGE = 100;

export class GitHubError extends Error {
	readonly status: number;
	readonly url: string;

	constructor(message: string, status: number, url: string) {
		super(message);
		this.name = "GitHubError";
		this.status = status;
		this.url = url;
	}
}

async function readErrorMessage(response: Response): Promise<string> {
	try {
		const body = (await response.json()) as { message?: string };

		if (body?.message) {
			return body.message;
		}
	} catch {
		// The error body is not always JSON. Fall through to the status line.
	}

	return `${response.status} ${response.statusText}`;
}

async function request<T>(path: string, token?: string): Promise<T> {
	const url = `${API_URL}${path}`;
	const headers: Record<string, string> = {
		Accept: "application/vnd.github+json",
		"X-GitHub-Api-Version": "2022-11-28",
		"User-Agent": "unveil-vk",
	};

	if (token) {
		headers.Authorization = `Bearer ${token}`;
	}

	const response = await fetch(url, { headers });

	if (!response.ok) {
		throw new GitHubError(
			await readErrorMessage(response),
			response.status,
			url,
		);
	}

	return (await response.json()) as T;
}

export async function analyze(
	username: string,
	options?: AnalyzeOptions,
): Promise<AnalyzeReturn> {
	const token = options?.token;
	const user = encodeURIComponent(username);

	const profile = await request<GitHubUser>(`/users/${user}`, token);

	const pageRequests = Array.from({ length: MAX_PAGES }, (_, index) => {
		return request<GitHubEvent[]>(
			`/users/${user}/events/public?per_page=${PER_PAGE}&page=${index + 1}`,
			token,
		);
	});

	const events = (await Promise.all(pageRequests)).flat();

	return {
		analysis: identify({
			user: profile,
			events,
		}),
		events: options?.showEvents ? events : [],
		eventsCount: events.length,
	};
}
