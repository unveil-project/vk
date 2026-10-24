import {
	fromTangled,
	type TangledRecord,
} from "@unveil/identity/providers/tangled";
import {
	type DidDocument,
	didDocumentUrl,
	fetchAccountCreatedAt,
	findHandle,
	findPds,
	listRecords,
	resolveDid,
} from "../atproto";
import { ProviderError, request } from "../http";
import type { Fetched } from "./shared";

// These describe the account: the repo count, repo names and bio come from
// them. They are kept whole so the cap on events can't drop them.
const TANGLED_ACCOUNT_COLLECTIONS = ["repo", "actor.profile"].map((name) => {
	return `sh.tangled.${name}`;
});

const TANGLED_ACTIVITY_COLLECTIONS = [
	"repo.issue",
	"repo.issue.state",
	"repo.issue.comment",
	"repo.pull",
	"repo.pull.status",
	"repo.pull.comment",
	"feed.comment",
	"feed.star",
	"feed.reaction",
	"graph.follow",
	"repo.collaborator",
	"string",
].map((name) => `sh.tangled.${name}`);

// listRecords returns at most 100 records a call. Activity is split across
// collections, so the newest of each are merged and cut to the same 300
// events as the other providers.
const TANGLED_RECORDS_PER_COLLECTION = 100;
const TANGLED_EVENTS = 300;

async function listTangledCollections(
	did: string,
	pds: string,
	collections: string[],
): Promise<TangledRecord[]> {
	const recordsByCollection = await Promise.all(
		collections.map((collection) => {
			return listRecords<TangledRecord>(
				did,
				pds,
				collection,
				TANGLED_RECORDS_PER_COLLECTION,
			);
		}),
	);

	return recordsByCollection.flat();
}

function newestTangledRecords(
	records: TangledRecord[],
	count: number,
): TangledRecord[] {
	const newestFirst = records.toSorted((a, b) => {
		const aCreatedAt = a.value.createdAt ?? "";
		const bCreatedAt = b.value.createdAt ?? "";

		return bCreatedAt.localeCompare(aCreatedAt);
	});

	return newestFirst.slice(0, count);
}

async function listTangledRecords(
	did: string,
	pds: string,
): Promise<TangledRecord[]> {
	const [accountRecords, activityRecords] = await Promise.all([
		listTangledCollections(did, pds, TANGLED_ACCOUNT_COLLECTIONS),
		listTangledCollections(did, pds, TANGLED_ACTIVITY_COLLECTIONS),
	]);

	return [
		...accountRecords,
		...newestTangledRecords(activityRecords, TANGLED_EVENTS),
	];
}

// Tangled lives on AT Protocol, so there is no token to send: every record
// read here is public.
export async function fetchTangled(
	username: string,
): Promise<Fetched<TangledRecord>> {
	const did = await resolveDid(username);

	const documentUrl = didDocumentUrl(did);
	const document = await request<DidDocument>(documentUrl);

	const pds = findPds(document);
	if (!pds) {
		throw new ProviderError("No PDS found for this account", 404, documentUrl);
	}

	const handle = findHandle(document) ?? username;

	const [createdAt, events] = await Promise.all([
		fetchAccountCreatedAt(did, pds),
		listTangledRecords(did, pds),
	]);

	return {
		input: fromTangled({
			account: { did, handle, createdAt },
			records: events,
		}),
		events,
		userId: did,
	};
}
