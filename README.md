# llm-reportcard

The **LLM Report Card** — `LLM_REPORT_CARD.md` + the Vite + React site that renders it — a running
per-model log of observed strengths and weaknesses, built into a static site and published to GitHub
Pages at <https://sawlemon.github.io/llm-reportcard/>.

> These notes are subjective personal observation from day-to-day use — not benchmark data, not measurements.

## Layout

```
LLM_REPORT_CARD.md          single source of truth for the site (stays at the repo root)
src/                         Vite + React + TypeScript site that renders the report card
scripts/                     build-time and CI scripts (report card validation)
.github/workflows/deploy.yml CI on every PR; build + deploy on every push to main
```

## The report card

`LLM_REPORT_CARD.md` is the **single source of truth**. There is no database and no CMS — the Vite build
reads the markdown, parses it, and inlines the result as the `virtual:report-card` module
(`src/data/reportCardPlugin.ts`). Every push to `main` redeploys the site from that file, so editing the
markdown is the only step needed to update the published page.

A malformed report card **fails the build** with the offending line number, rather than silently shipping a
broken page. The same parser runs under `npm test`, so problems surface locally too.

### Commit-time formatting guard

`npm install` / `npm ci` enables the repository's `.githooks/pre-commit` hook. It formats staged
Prettier-supported files and re-stages them before the commit is created; `.prettierignore` still
protects source-of-truth prose such as `LLM_REPORT_CARD.md`. GitHub Actions keeps the final
`format:check` as a backstop for commits made with hooks bypassed or from another environment.

### Authoring an observation

The structure is provider → model → aspect table:

```markdown
## Anthropic

### Claude Opus 5

| Aspect | Pros | Cons |
|---|---|---|
| Reasoning | holds a long chain without drifting | |
| Coding | strong refactors; self-verifies with tests | over-eager on unrequested cleanup |
| Instruction-following | | |
| Tool use / agentic | | |
| Context handling | | |
| Speed / latency | | |
| Cost / efficiency | | |
| Refusals / safety behavior | | |
| Formatting / output quality | | |
| Other | | |
```

Rules the parser enforces:

- `##` is the provider heading, `###` is the model heading. A table must follow a model heading.
- Columns must be exactly `Aspect | Pros | Cons`, in that order.
- Strengths go in `Pros`, weaknesses in `Cons`. Never mix the two.
- Multiple notes in one cell are separated by **semicolons** (`;`). Semicolons inside parentheses are
  ignored, so `foo (a; b); bar` is two notes, not three. Empty cells are fine.
- Aspect names are **validated against a canonical list** and anything else is a build error. The list is
  `CANONICAL_ASPECTS` in `src/data/types.ts`:
  `Reasoning`, `Coding`, `Instruction-following`, `Tool use / agentic`, `Context handling`,
  `Speed / latency`, `Cost / efficiency`, `Refusals / safety behavior`, `Formatting / output quality`,
  `Other`. A near miss (differing only in case or whitespace) is reported with the intended name
  suggested, so `tool use/agentic` tells you to write `Tool use / agentic`. To add a genuinely new aspect,
  extend `CANONICAL_ASPECTS` first.
- Fenced code blocks are stripped before parsing, which is why the template in the file's own
  "How to use" section is not treated as data.

## Commands

Node **26** (see `.nvmrc`; enforced by `engines.node` in `package.json`).

```bash
npm install       # install dependencies
npm run dev       # dev server; edits to LLM_REPORT_CARD.md hot-reload
npm run validate  # parse LLM_REPORT_CARD.md and report schema errors as file:line
npm test          # vitest — parser grammar (fixtures) + component tests
npm run lint      # eslint (flat config, typescript-eslint + react-hooks + react-refresh)
npm run format    # prettier --write .   (npm run format:check to verify only)
npm run build     # tsc -b && vite build → dist/
```

CI runs `lint`, `format:check`, `validate`, `test`, and `build` on every pull request against `main`;
pushes to `main` additionally deploy `dist/` to GitHub Pages.

Editing `LLM_REPORT_CARD.md` cannot break the test suite — tests assert against fixtures, and the live
document is only checked for invariants that hold for any valid card. A genuine schema error fails
`npm run validate` (and the build) with a line number instead.
