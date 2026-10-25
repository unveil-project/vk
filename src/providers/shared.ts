import type { IdentifyInput } from "@unveil/identity";

export type Fetched<Event, User> = {
	input: IdentifyInput;
	events: Event[];
	user: User;
};
