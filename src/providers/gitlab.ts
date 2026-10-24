import {
	fromGitLab,
	type GitLabEvent,
	type GitLabProject,
	type GitLabUser,
} from "@unveil/identity/providers/gitlab";
import {
	buildUrl,
	ProviderError,
	request,
	requestPages,
	send,
	withToken,
} from "../http";
import type { Fetched } from "./shared";

const GITLAB_API = "https://gitlab.com/api/v4";

// GitLab serves at most 100 items a page and has no cap on events, so 3 pages
// stop at the same 300 as the other providers.
const GITLAB_PAGES = 3;
const GITLAB_PER_PAGE = 100;

function collectProjectIds(events: GitLabEvent[]): number[] {
	const projectIds = new Set<number>();

	for (const event of events) {
		if (event.project_id) {
			projectIds.add(event.project_id);
		}
	}

	return [...projectIds];
}

// Projects we can't see return 404. Those are left unnamed instead of failing.
async function fetchGitLabProject(
	id: number,
	headers: Record<string, string>,
): Promise<GitLabProject | undefined> {
	try {
		return await request<GitLabProject>(
			`${GITLAB_API}/projects/${id}`,
			headers,
		);
	} catch (error) {
		if (error instanceof ProviderError && error.status === 404) {
			return undefined;
		}

		throw error;
	}
}

export async function fetchGitLab(
	username: string,
	token?: string,
): Promise<Fetched<GitLabEvent>> {
	const headers = withToken(token);
	const lookupUrl = buildUrl(`${GITLAB_API}/users`, { username });
	const [found] = await request<GitLabUser[]>(lookupUrl, headers);

	if (!found) {
		throw new ProviderError("404 User Not Found", 404, lookupUrl);
	}

	const userUrl = `${GITLAB_API}/users/${found.id}`;

	const eventsPageUrl = (page: number) => {
		return buildUrl(`${userUrl}/events`, { per_page: GITLAB_PER_PAGE, page });
	};

	// One project per page is enough: the total lives in the X-Total header.
	const projectsUrl = buildUrl(`${userUrl}/projects`, { per_page: 1 });

	const [profile, events, projectsResponse] = await Promise.all([
		request<GitLabUser>(userUrl, headers),
		requestPages<GitLabEvent>(GITLAB_PAGES, eventsPageUrl, headers),
		send(projectsUrl, headers),
	]);

	// Events only carry a project id. Look each one up to name its repo.
	const projectIds = collectProjectIds(events);
	const projects = await Promise.all(
		projectIds.map((id) => {
			return fetchGitLabProject(id, headers);
		}),
	);

	return {
		input: fromGitLab({
			user: profile,
			events,
			publicRepos: Number(projectsResponse.headers.get("X-Total") ?? 0),
			projects: projects.filter((project) => project !== undefined),
		}),
		events,
		userId: profile.id,
	};
}
