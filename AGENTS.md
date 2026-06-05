# Project Instructions

## GitHub Operations

- Only use the GitHub account explicitly specified by the user for pushes, PRs, and repo creation.
- Do not attempt to switch to or try other GitHub accounts if a push fails.
- If a push fails due to token scope or permissions, ask the user which account to use rather than switching accounts automatically.

## Code Quality Gates

### Before every commit of `.js`, `.ts`, `.py`, or `.sh` files:

1. **Syntax check**: Run `node --check <file>` (JS/TS) or `python -m py_compile <file>` (Python) before committing. Never skip this step.
2. **No dead code**: When replacing logic (e.g., swapping a regex approach for `matchAll`), delete the old code entirely. Do not leave broken/unreachable code blocks.
3. **Close function call objects correctly**: Always use `});` (closing brace + paren + semicolon) when passing an object literal to a function, not `);` alone. Example: `chromium.launch({ ... });` not `chromium.launch({ ... );`.

## Failure Lessons

<!-- 
  HOW TO ADD A LESSON:
  1. When a bug/CI failure is fixed, add a new ### section below.
  2. Use the commit hash or date as an anchor.
  3. Include: Root cause, Detection, Fix, Prevention rule.
  4. The prevention rule should be something actionable (a check, a pattern, a tool flag).
  5. Reference the lesson number in commit messages when applicable.
  6. Keep lessons in reverse chronological order (newest first).
-->

### Lesson 3 (2025-05-15): ASP.NET ViewState prevents direct HTTP POST fallback
- **Root cause**: Direct HTTP POST to `krama.karnataka.gov.in` returns 500 because ViewState validation requires a full browser session with cookies.
- **Detection**: HTTP POST step returned status 500; Playwright browser method worked fine.
- **Fix**: Use Playwright browser automation as primary method; HTTP POST is kept as a best-effort first attempt.
- **Prevention**: For ASP.NET WebForms sites, always use browser automation — simple HTTP POST with form data won't work.

### Lesson 2 (2025-05-15): GitHub Actions CI timeout — `networkidle` too strict
- **Root cause**: `page.goto(url, { waitUntil: 'networkidle' })` times out on slow government sites from CI runners.
- **Detection**: CI log showed `net::ERR_CONNECTION_TIMED_OUT` with `networkidle`; local tests passed.
- **Fix**: Use `waitUntil: 'domcontentloaded'` + `waitForSelector()` for element-specific waits. Use `waitForNavigation()` for form submissions.
- **Prevention**: Prefer `domcontentloaded` over `networkidle` for sites with slow/stalled network requests.

### Lesson 1 (2025-05-15): Broken regex loop caused SyntaxError in CI
- **Root cause**: Wrote a `while` loop with a nonsensical condition (`cellRegex.exec(rows[ri]) !== null ? [cellRegex.exec(rows[ri])] : null`) and empty body — dead code left behind when replacing with `matchAll()`.
- **Detection**: `node --check` would have caught it locally before push. CI caught it as `SyntaxError: Unexpected token ')'`.
- **Fix**: Deleted the dead code block; `matchAll()` was already doing the job.
- **Prevention**: Always run `node --check` on JS files before committing. Never leave unused code blocks.

## Lesson Template (copy and fill for new failures)

<!--
### Lesson N (DATE): SHORT TITLE
- **Root cause**: What caused the failure?
- **Detection**: How was it detected? (CI error message, local test, user report?)
- **Fix**: What change resolved it?
- **Prevention**: What rule/check/habit prevents recurrence?
-->