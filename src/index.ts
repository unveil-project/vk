import { type IdentifyResult, identify } from "@unveil/identity";
import type { CodebergActivity } from "@unveil/identity/providers/codeberg";
import type { GitHubEvent } from "@unveil/identity/providers/github";
import type { GitLabEvent } from "@unveil/identity/providers/gitlab";
import type { TangledRecord } from "@unveil/identity/providers/tangled";
import { ProviderError } from "./http";
import { fetchCodeberg } from "./providers/codeberg";
import { fetchGitHub } from "./providers/github";
import { fetchGitLab } from "./providers/gitlab";
import type { Fetched } from "./providers/shared";
import { fetchTangled } from "./providers/tangled";

export type {
	CodebergActivity,
	GitHubEvent,
	GitLabEvent,
	IdentifyResult,
	TangledRecord,
};

export { ProviderError };

export type Provider = "github" | "gitlab" | "codeberg" | "tangled";

export type ProviderEvent =
	| GitHubEvent
	| GitLabEvent
	| CodebergActivity
	| TangledRecord;

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
	gitlab: fetchGitLab,
	codeberg: fetchCodeberg,
	tangled: fetchTangled,
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
