import {
	type CodebergActivity,
	type CodebergUser,
	fromCodeberg,
} from "@unveil/identity/providers/codeberg";
import { buildUrl, request, requestPages, send, withToken } from "../http";
import type { Fetched } from "./shared";

const CODEBERG_API = "https://codeberg.org/api/v1";

// Forgejo serves at most 50 items a page, so it takes 6 to reach the same 300.
const CODEBERG_PAGES = 6;
const CODEBERG_PER_PAGE = 50;

export async function fetchCodeberg(
	username: string,
	token?: string,
): Promise<Fetched<CodebergActivity>> {
	const user = encodeURIComponent(username);
	const headers = withToken(token);

	const userUrl = `${CODEBERG_API}/users/${user}`;

	const eventsPageUrl = (page: number) => {
		return buildUrl(`${userUrl}/activities/feeds`, {
			"only-performed-by": true,
			limit: CODEBERG_PER_PAGE,
			page,
		});
	};

	// One repo per page is enough: the total lives in the X-Total-Count header.
	const reposUrl = buildUrl(`${userUrl}/repos`, { limit: 1 });

	const [profile, events, reposResponse] = await Promise.all([
		request<CodebergUser>(userUrl, headers),
		requestPages<CodebergActivity>(CODEBERG_PAGES, eventsPageUrl, headers),
		send(reposUrl, headers),
	]);

	return {
		input: fromCodeberg({
			user: profile,
			events,
			publicRepos: Number(reposResponse.headers.get("X-Total-Count") ?? 0),
		}),
		events,
		userId: profile.id,
	};
}
