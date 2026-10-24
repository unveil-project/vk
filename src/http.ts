type QueryParams = Record<string, string | number | boolean>;

export function buildUrl(url: string, params: QueryParams): string {
	const query = new URLSearchParams();

	for (const [key, value] of Object.entries(params)) {
		query.set(key, String(value));
	}

	return `${url}?${query}`;
}

export class ProviderError extends Error {
	readonly status: number;
	readonly url: string;

	constructor(message: string, status: number, url: string) {
		super(message);
		this.name = "ProviderError";
		this.status = status;
		this.url = url;
	}
}

async function readErrorMessage(response: Response): Promise<string> {
	try {
		const body = (await response.json()) as { message?: string };

		if (body?.message) {
			return body.message;
		}
	} catch {
		// The error body is not always JSON. Fall through to the status line.
	}

	return `${response.status} ${response.statusText}`;
}

export async function send(
	url: string,
	headers: Record<string, string> = {},
): Promise<Response> {
	const response = await fetch(url, { headers });

	if (!response.ok) {
		throw new ProviderError(
			await readErrorMessage(response),
			response.status,
			url,
		);
	}

	return response;
}

export async function request<T>(
	url: string,
	headers?: Record<string, string>,
): Promise<T> {
	const response = await send(url, headers);
	return (await response.json()) as T;
}

export async function requestPages<T>(
	count: number,
	url: (page: number) => string,
	headers?: Record<string, string>,
): Promise<T[]> {
	const pageRequests = Array.from({ length: count }, (_, index) => {
		return request<T[]>(url(index + 1), headers);
	});

	return (await Promise.all(pageRequests)).flat();
}

export function withToken(
	token: string | undefined,
	headers: Record<string, string> = {},
): Record<string, string> {
	if (!token) {
		return headers;
	}

	return {
		...headers,
		Authorization: `Bearer ${token}`,
	};
}
