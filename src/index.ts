import {
	type GitHubEvent,
	type IdentifyResult,
	identify,
} from "@unveil/identity";
import { Octokit } from "octokit";

export type AnalyzeOptions = {
	token?: string;
	showEvents?: boolean;
};

export type AnalyzeReturn = {
	analysis: IdentifyResult;
	events: GitHubEvent[];
	eventsCount: number;
};

// This is the max amount of pages GitHub allows.
const MAX_PAGES = 3;

export async function analyze(
	username: string,
	options?: AnalyzeOptions,
): Promise<AnalyzeReturn> {
	const octokit = new Octokit({
		auth: options?.token,
	});

	const { data: user } = await octokit.rest.users.getByUsername({
		username,
	});

	const pageRequests = Array.from({ length: MAX_PAGES }, (_, index) => {
		return octokit.rest.activity.listPublicEventsForUser({
			username,
			per_page: 100,
			page: index + 1,
		});
	});

	const responses = await Promise.all(pageRequests);
	const events = responses.flatMap((response) => response.data);

	return {
		analysis: identify({
			user,
			events,
		}),
		events: options?.showEvents ? events : [],
		eventsCount: events.length,
	};
}
