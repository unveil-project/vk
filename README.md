# vk

Fetch GitHub account activity and analyze it for automation patterns

This is the batteries-included wrapper around [`@unveil/identity`](https://github.com/unveil-project/identity). Give it a username and it does the GitHub API calls for you, then hands the result to the scoring engine.

It talks to the GitHub REST API with native `fetch` and has no dependencies beyond `@unveil/identity`, so it runs the same in Node, Deno, Bun, the browser and edge runtimes.

Both packages are the logic behind [AgentScan](https://agentscan.netlify.app), a tool for analyzing GitHub account behavior to detect potential AI agents and automated activity. The results are indicators, not verdicts.

### Install

```bash
npm install @unveil/vk
```

### Usage

```js
import { analyze } from "@unveil/vk";

const { analysis, eventsCount } = await analyze("github_account_username", {
  token: process.env.GITHUB_TOKEN,
});

console.log(analysis.classification); // "organic" | "mixed" | "automation" | "insufficient-data"
console.log(analysis.score);          // 100 = human, 0 = automation
console.log(analysis.confidence);     // 0-1: how much evidence there was
console.log(eventsCount);             // how many events we actually got back
```

### Options

```js
analyze(username, {
  token: "ghp_...",   // GitHub token. Optional, but strongly recommended
  showEvents: true,   // return the raw events too. Off by default
});
```

`token` is sent as `Authorization: Bearer`. Without it you are on the unauthenticated
rate limit, which is 60 requests per hour for the whole IP — and each `analyze`
call spends 4 of them. With a token you get 5000 per hour. The token needs no
scopes; all the data read here is public.

`showEvents` controls whether the raw events come back in the result. They are
left out by default because 300 GitHub events is a lot of JSON to carry around
when all you wanted was the score.

### Result

```js
{
  analysis,     // the full IdentifyResult from @unveil/identity
  events,       // the raw events, or [] unless showEvents is set
  eventsCount,  // always the real count, even when events is empty
}
```

`analysis` is whatever `identify()` returns — score, classification, confidence,
flags, groups, window, timezone and profile. See the
[identity README](https://github.com/unveil-project/identity#readme) for the full
shape and for what each of the 53 heuristics looks at.

### How much it fetches

`analyze` requests three pages of 100 public events, in parallel. That is both
the maximum GitHub serves from the public events endpoint and the window
`@unveil/identity` scores over, so there is nothing to gain from asking for more.

Accounts with less activity than that simply return fewer events, and the
analysis reports lower `confidence` to match.

### Errors

`analyze` rejects instead of returning a partial result. A missing user, a
revoked token or an exhausted rate limit all come back as a plain `Error`
carrying GitHub's own message, with the `status` and `url` of the failed request
attached to it:

```js
try {
  await analyze("ghost");
} catch (error) {
  if (error.status === 404) {
    // no such account
  }
}
```

Network failures reject with whatever `fetch` threw, untouched.

### Which package do I want?

Use **`@unveil/vk`** when you have a username and want an answer.

Use [**`@unveil/identity`**](https://github.com/unveil-project/identity) when you
already have the user and events — from your own database, a cache, a webhook, or
your own authenticated client — and only want the scoring. It has no network
access and no dependencies on how you got the data.

### Issues and feature requests

Please drop an issue if you find something that doesn't work, or have an idea for something that works better.
