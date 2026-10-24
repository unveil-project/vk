import { buildUrl, request } from "./http";

const BSKY_API = "https://bsky.social/xrpc";
const PLC_DIRECTORY = "https://plc.directory";

export type DidDocument = {
	alsoKnownAs?: string[];
	service?: { id: string; serviceEndpoint: string }[];
};

type PlcAuditEntry = {
	createdAt: string;
};

type ProfileRecord = {
	value: { createdAt?: string };
};

type RecordList<T> = {
	records: T[];
};

function isPlcDid(did: string): boolean {
	return did.startsWith("did:plc:");
}

export async function resolveDid(username: string): Promise<string> {
	if (username.startsWith("did:")) {
		return username;
	}

	const url = buildUrl(`${BSKY_API}/com.atproto.identity.resolveHandle`, {
		handle: username,
	});
	const response = await request<{ did: string }>(url);

	return response.did;
}

export function didDocumentUrl(did: string): string {
	if (isPlcDid(did)) {
		return `${PLC_DIRECTORY}/${did}`;
	}

	const domain = did.replace(/^did:web:/, "");
	return `https://${domain}/.well-known/did.json`;
}

export function findPds(document: DidDocument): string | undefined {
	const pdsService = document.service?.find((service) => {
		return service.id.endsWith("#atproto_pds");
	});

	return pdsService?.serviceEndpoint;
}

export function findHandle(document: DidDocument): string | undefined {
	const alias = document.alsoKnownAs?.[0];
	return alias?.replace(/^at:\/\//, "");
}

// AT Protocol keeps no sign-up date. The first PLC operation is the closest.
async function fetchPlcCreatedAt(did: string): Promise<string> {
	const url = `${PLC_DIRECTORY}/${did}/log/audit`;
	const log = await request<PlcAuditEntry[]>(url);

	return log[0]?.createdAt ?? "";
}

// did:web accounts have no PLC log, so fall back to the Bluesky profile record.
async function fetchProfileCreatedAt(
	did: string,
	pds: string,
): Promise<string> {
	const url = buildUrl(`${pds}/xrpc/com.atproto.repo.getRecord`, {
		repo: did,
		collection: "app.bsky.actor.profile",
		rkey: "self",
	});
	const record = await request<ProfileRecord>(url);

	return record.value.createdAt ?? "";
}

export async function fetchAccountCreatedAt(
	did: string,
	pds: string,
): Promise<string> {
	if (isPlcDid(did)) {
		return fetchPlcCreatedAt(did);
	}

	return fetchProfileCreatedAt(did, pds);
}

export async function listRecords<T>(
	did: string,
	pds: string,
	collection: string,
	limit: number,
): Promise<T[]> {
	const url = buildUrl(`${pds}/xrpc/com.atproto.repo.listRecords`, {
		repo: did,
		collection,
		limit,
	});
	const response = await request<RecordList<T>>(url);

	return response.records;
}
