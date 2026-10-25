import type {
	GitHubEvent,
	GitHubUser,
} from "@unveil/identity/providers/github";
import { type IdentityReport, report } from "@unveil/identity/report";
import { ProviderError } from "./http";
import { fetchGitHub } from "./providers/github";
import type { Fetched } from "./providers/shared";

export type { GitHubEvent, GitHubUser, IdentityReport };

export { ProviderError };

export type Provider = "github";

export type ProviderEvent = GitHubEvent;

export type ProviderUser = GitHubUser;

export type AnalyzeOptions = {
	token?: string;
	showEvents?: boolean;
	provider?: Provider;
};

export type AnalyzeReturn = {
	report: IdentityReport;
	events: ProviderEvent[];
	eventsCount: number;
	user: ProviderUser;
};

type ProviderFetch = (
	username: string,
	token?: string,
) => Promise<Fetched<ProviderEvent, ProviderUser>>;

const providers: Record<Provider, ProviderFetch> = {
	github: fetchGitHub,
};

export async function analyze(
	username: string,
	options?: AnalyzeOptions,
): Promise<AnalyzeReturn> {
	const provider: Provider = options?.provider ?? "github";
	const fetchProvider = providers[provider];

	const { input, events, user } = await fetchProvider(username, options?.token);

	return {
		report: report(input),
		user,
		events: options?.showEvents ? events : [],
		eventsCount: events.length,
	};
}
