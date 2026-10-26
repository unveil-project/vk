import type { AccountInput } from "@unveil/identity";

export type Fetched<Event, User> = {
	input: AccountInput;
	events: Event[];
	user: User;
};
