# ADR 0001: Runtime state, pure config reads, and one renderer per preset

Status: accepted (v1.8.0)

## Context

The extension used three module-level `let` variables (`currentStyle`,
`fullFooterEnabled`, `customStyleConfig`) and a `loadConfig()` that both read
settings and wrote those variables. `/beautify` set the variables, then called
`loadConfig()`, which read the old values back off disk and overwrote them. The
user's style choice only survived a restart, and enabling full-footer rendered
an empty first frame.

The preset table also carried three byte-identical duplicates (`matrix` = `tokyo`,
`powerline` = `glass` = `nord`), so "how many styles are there" had two different
answers depending on which array you read.

## Decisions

1. **`loadConfig()` is pure.** It returns a `ResolvedConfig` and mutates nothing.
   Callers decide what to do with the result. Any future "just re-read the config
   here" shortcut must go through `applyConfig`, never a side effect inside the
   reader.
2. **One mutable `runtime` object holds live state.** The `setStatus` wrapper is
   installed once per session, so it must read `runtime.style` at call time
   rather than capture a value in a closure. Apply paths write an explicit
   override (`applyConfig(cfg, { style, fullFooter })`) so the user's fresh
   choice always beats what is still on disk.
3. **No two presets may be byte-identical.** Retiring a preset means adding an
   entry to `STYLE_ALIASES`, not keeping a duplicate table entry alive.
4. **`off` is a physical delete, from every file that has the key.** Reporting
   success after a swallowed write error is not allowed.
5. **Visible width is measured on unstyled text.** `theme.fg` only wraps, so
   measuring the styled string counts escape sequences. Callers that already
   know the plain width pass it to the fold algorithm.

## Consequences

- The apply path reads settings once, writes memory, then persists.
- Adding a preset means one table entry plus one menu line; adding a *duplicate*
  preset now fails review.
- `npm run check` (typecheck + lint + tests) is the only accepted gate.
