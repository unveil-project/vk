import type { IdentifyInput } from "@unveil/identity";

export type Fetched<Event> = {
	input: IdentifyInput;
	events: Event[];
	userId?: number | string;
};
