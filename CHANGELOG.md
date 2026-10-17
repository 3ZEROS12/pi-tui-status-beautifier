# Changelog

## [1.8.0] - 2026-10-18

### Changed
- Split the single 1064-line extension file into `extensions/lib/**` (presets, width, fold, settings, status, footer, state, command). The entry file keeps its name and re-exports the public surface, so `pi.extensions` and existing imports are unchanged.
- Retired three byte-identical presets: `matrix` (same as `tokyo`), `powerline` and `glass` (both same as `nord`). Old names still resolve through aliases, so existing `settings.json` files keep working.
- `minimal` is now selectable from the `/beautify` menu (it was already the config default but was missing from the list).
- Token totals in full-footer mode are memoised on the session entry array instead of rescanned on every repaint.

### Fixed
- **Style changes now take effect immediately.** `/beautify` used to write the new style and then call `loadConfig()`, which reassigned the same module globals from disk — silently reverting the user's choice until the next restart, and rendering an empty first frame when enabling full-footer.
- `off` now deletes the `beautifier` key from **both** the local and global settings file. Previously it only touched the local file when that file existed, so a global block could survive the revert.
- Revert no longer reports success after a swallowed write failure; it reports a warning with the failing path.
- Badge folding can no longer exceed the terminal width: the fold slot is reserved for the *remaining* badges, the `<= 2 badges` early return is gone, and the width sweep 8..120 columns is covered by tests.
- Dingbats and geometric shapes (`✓ ✗ ✦ ▲ ◆ ● ❯`) are measured as one cell instead of two. Emoji presentation (`❤️`), keycaps (`1️⃣`) and ZWJ sequences are measured correctly.
- The spinner no longer defeats the dirty check for non-spinning badges: only spinner-bearing badges bypass the value comparison.

### Added
- `tsconfig.json` with `strict`, plus `npm run typecheck` and `npm run check`.
- 22 new tests covering config hierarchy purity, apply/revert, zero-trace cleanup, fold boundaries and cell width.

## [1.1.1] - 2026-08-23
### Added
- Memory-hoisted visual cell-width checks of character sequences to correctly align TUI status templates (Finding 5)
- State cache-based dirty-checking for status updates to prevent redundant redrawing and layout flickering (Finding 6)
### Fixed
- Fixed TUI alignment issues involving full-width CJK characters and emojis in layout paddings

