# AGENTS.md

General coc.nvim extension maintenance, testing, auditing, and release workflows
are covered by the installed skills. This file only records constraints specific
to `coc-highlight`.

## Project notes

- `src/index.ts` activates the extension and registers the document highlight
  and document color providers.
- `src/bufferItem.ts` owns per-buffer color state and incremental updates.
- `src/matchers.ts` parses colors. `src/workers.ts` and `src/worker.ts` implement
  the main-thread/worker-thread protocol.
- `lib/` is generated from `src/index.ts` and `src/worker.ts`; edit `src/`, not
  `lib/`.
- The bundle targets Node 14.14, and `package.json` declares coc.nvim `^0.0.82`.
- `tests/` contains manual language fixtures; no automated test runner is
  currently configured.

## Runtime invariants

- Keep the message types and request IDs in `src/workers.ts` and `src/worker.ts`
  synchronized. Every request must settle and clean up its callback exactly once.
- A successful parse returns one color array per input line. Cancellation or the
  time limit may return no result; never install partial or mismatched results.
- Color spans are zero-based source character offsets. Normalizing a color value
  must not change the highlighted source range.
- Configuration keys and defaults must agree across `package.json`,
  `src/index.ts`, `src/types.ts`, and `Readme.md`.

Run `npm run prepare` after source changes and confirm both `lib/index.js` and
`lib/worker.js` are produced. The build script logs caught esbuild errors without
forcing a nonzero exit, so command status alone is not sufficient.
