# A future internal version for coworkers (not built)

This version of Bridge is for **public material and your own notes**, runs only on your machine, and touches nothing internal. An internal version for coworkers is a separate, later project. This page records what it would need, so the current code stays ready for it without containing any of it.

## What it would be
The same pipeline (ingest → analyze → script → faithfulness gate → render), deployed as an internal web service so a coworker can paste an internal design doc, a package README or a wiki page and get a short explainer. Same lengths, same source map.

## What must change (and why it is not in this repo)
| Area | This version | Internal version |
|---|---|---|
| Where it runs | your laptop, 127.0.0.1 only | an internal service on company infrastructure, private network only |
| Who can use it | you | authenticated employees only, through the company's standard employee sign-in, with per-user authorization; never anonymous |
| Models | local open model, or your own provider key | only models approved for the data's classification, through approved internal model endpoints |
| Data | public material + your notes; a note warns against confidential content | classified data handling: retention limits, no copies outside approved storage, deletion on request, audit logs |
| Inputs | text, PDF, images, public links, uploads | plus approved internal document sources via their sanctioned APIs, respecting each document's permissions (a viewer only gets videos of docs they can read) |
| Outputs | mp4 on your disk | stored with the same access controls as the source; watermark with classification |
| Security review | self-review + agent reviews | the company's formal security and privacy review before launch |

## Design hooks already in place
- **Engines are injected** (`src/node/pipeline.ts`): an internal model endpoint is one more `LlmProvider`.
- **Locality is explicit** (`LlmProvider.locality`): a policy layer can refuse cloud models for internal data, the way LachedInAI's ModelRouter does.
- **Every claim is traced** (source map), which internal reviewers will require.
- **No secrets in code, keys only via a store, host-pinned clients**: the same pattern maps onto a managed secret store.

## Explicitly out of scope here
No internal credentials, endpoints, package names, tools or sites appear in this repository, and none should be added to it. The internal version starts as a new project that depends on this one's public core.
