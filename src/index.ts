import type { GitHubEvent } from "@unveil/identity/providers/github";
import { type IdentityReport, report } from "@unveil/identity/report";
import { ProviderError } from "./http";
import { fetchGitHub } from "./providers/github";
import type { Fetched } from "./providers/shared";

export type { GitHubEvent, IdentityReport };

export { ProviderError };

export type Provider = "github";

export type ProviderEvent = GitHubEvent;

export type AnalyzeOptions = {
	token?: string;
	showEvents?: boolean;
	provider?: Provider;
};

export type AnalyzeReturn = {
	report: IdentityReport;
	events: ProviderEvent[];
	eventsCount: number;
	userId?: number | string;
};

type ProviderFetch = (
	username: string,
	token?: string,
) => Promise<Fetched<ProviderEvent>>;

const providers: Record<Provider, ProviderFetch> = {
	github: fetchGitHub,
};

export async function analyze(
	username: string,
	options?: AnalyzeOptions,
): Promise<AnalyzeReturn> {
	const provider: Provider = options?.provider ?? "github";
	const fetchProvider = providers[provider];

	const { input, events, userId } = await fetchProvider(
		username,
		options?.token,
	);

	return {
		report: report(input),
		userId,
		events: options?.showEvents ? events : [],
		eventsCount: events.length,
	};
}
