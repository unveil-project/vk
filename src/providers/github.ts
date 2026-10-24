import {
	fromGitHub,
	type GitHubEvent,
	type GitHubUser,
} from "@unveil/identity/providers/github";
import { buildUrl, request, requestPages, withToken } from "../http";
import type { Fetched } from "./shared";

const GITHUB_API = "https://api.github.com";

// GitHub serves at most 100 events a page and stops the timeline at 300.
const GITHUB_PAGES = 3;
const GITHUB_PER_PAGE = 100;

export async function fetchGitHub(
	username: string,
	token?: string,
): Promise<Fetched<GitHubEvent>> {
	const user = encodeURIComponent(username);
	const headers = withToken(token, {
		Accept: "application/vnd.github+json",
		"X-GitHub-Api-Version": "2022-11-28",
		"User-Agent": "unveil-vk",
	});

	const profile = await request<GitHubUser>(
		`${GITHUB_API}/users/${user}`,
		headers,
	);

	const eventsPageUrl = (page: number) => {
		return buildUrl(`${GITHUB_API}/users/${user}/events/public`, {
			per_page: GITHUB_PER_PAGE,
			page,
		});
	};

	const events = await requestPages<GitHubEvent>(
		GITHUB_PAGES,
		eventsPageUrl,
		headers,
	);

	return {
		input: fromGitHub({ user: profile, events }),
		events,
		userId: profile.id,
	};
}
