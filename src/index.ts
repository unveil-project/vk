import { type IdentifyResult, identify } from "@unveil/identity";
import type { GitHubEvent } from "@unveil/identity/providers/github";
import { ProviderError } from "./http";
import { fetchGitHub } from "./providers/github";
import type { Fetched } from "./providers/shared";

export type { GitHubEvent, IdentifyResult };

export { ProviderError };

export type Provider = "github";

export type ProviderEvent = GitHubEvent;

export type AnalyzeOptions = {
	token?: string;
	showEvents?: boolean;
	provider?: Provider;
};

export type AnalyzeReturn = {
	analysis: IdentifyResult;
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
	const provider = options?.provider ?? "github";
	const fetchProvider = providers[provider];

	const { input, events, userId } = await fetchProvider(
		username,
		options?.token,
	);

	return {
		analysis: identify(input),
		userId,
		events: options?.showEvents ? events : [],
		eventsCount: events.length,
	};
}
