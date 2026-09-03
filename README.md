# Riverside Clinic — WebMCP Appointment Booking Demo

A single-page appointment-booking form for a fictional clinic that exposes
its own functionality as **WebMCP tools**, so an AI agent (browser copilot,
assistant extension, etc.) can fill out and stage a booking on a user's
behalf — while a **hard, code-level guarantee** ensures only the human in
front of the screen can actually finalize it.

Live demo: **[pipaniaastha.github.io/wepmcp-appointment](https://pipaniaastha.github.io/wepmcp-appointment/)**
Source: **[github.com/pipaniaastha/wepmcp-appointment](https://github.com/pipaniaastha/wepmcp-appointment)**

## Table of contents

- [What is WebMCP?](#what-is-webmcp)
- [What this project does](#what-this-project-does)
- [The four tools](#the-four-tools)
- [Why `confirm_and_submit` can't finalize the booking](#why-confirm_and_submit-cant-finalize-the-booking)
- [Beyond the four tools](#beyond-the-four-tools)
- [Project structure](#project-structure)
- [Accessibility](#accessibility)
- [Running it locally](#running-it-locally)
- [Testing](#testing)
- [Testing with a WebMCP-capable browser or agent](#testing-with-a-webmcp-capable-browser-or-agent)
- [Adopting this pattern on your own site](#adopting-this-pattern-on-your-own-site)
- [Deployment](#deployment)
- [Design decisions worth knowing about](#design-decisions-worth-knowing-about)

## What is WebMCP?

[WebMCP](https://github.com/webmachinelearning/webmcp) is an early, in-progress
proposal for letting a web page describe **tools** — small, named, typed
functions — that an AI agent running alongside the browser can call directly,
the same way [MCP (Model Context Protocol)](https://modelcontextprotocol.io/)
lets an LLM call tools exposed by a server. Instead of an agent trying to
drive a page by guessing at CSS selectors and simulating clicks (which breaks
whenever the page's markup changes), the page itself registers a small,
stable, documented API via `document.modelContext.registerTool()`.

Concretely, a page calls something like:

```js
document.modelContext.registerTool({
  name: "complete_form_field",
  description: "Fill in a single appointment field...",
  inputSchema: { /* JSON Schema for the tool's arguments */ },
  execute: function (args) { /* ... */ }
});
```

An agent with WebMCP support can then enumerate the page's registered tools
and call them with structured arguments, getting back structured results —
no DOM scraping, no brittle selectors, no guessing what a button does.

WebMCP is still behind flags / extension support in browsers today, which is
why this project also ships a **Tool Call Console** (see below) that calls
the exact same tool functions manually, so the functionality can be
exercised and demonstrated in any browser.

## What this project does

This is a **static, backend-free** clinic appointment form. A patient (or an
agent acting for them) fills in:

- Full name, email, phone (required: name, email)
- Appointment type, preferred date, preferred time (all required)
- Optional notes for the clinician

The form validates each field as it's filled in — including checking that a
chosen date/time slot is actually open, using a small in-memory "already
booked by another patient" seed data set — and only allows staging a review
once every required field is valid.

The page registers **four WebMCP tools** that mirror this workflow, so an
agent can drive the entire data-entry part of the task. What the agent
*cannot* do is press the final "Confirm & book appointment" button — that is
wired to plain UI code that no tool can reach. See
["Why `confirm_and_submit` can't finalize the booking"](#why-confirm_and_submit-cant-finalize-the-booking).

There is no backend and no persistence: all state lives in the page's memory
and resets on reload (or via the "Start over" button).

## The four tools

| Tool | Purpose |
|---|---|
| `describe_current_state` | Reports every field's current value, which required fields are still missing or invalid (with the specific reason), the booking status, and the available appointment types / open dates / open times for the currently selected date. This is the tool an agent should call first, and after any action, to reorient itself. |
| `list_available_actions` | Given the current state, returns a concrete list of next steps — e.g. exactly which fields still need values and why, or "stage for confirmation," or "wait on the human to click Confirm." Saves the agent from re-deriving state logic itself. |
| `complete_form_field` | Fills exactly one field (`full_name`, `email`, `phone`, `appointment_type`, `date`, `time`, or `notes`). Runs the same validation the human-facing form uses (format checks, valid-option checks, open-slot checks) and, on success, writes into the *real* DOM inputs — this is not a shadow copy, it's the same state the human sees and can edit further. |
| `confirm_and_submit` | Checks that every required field is currently valid, and if so, renders the review panel and moves the booking to `awaiting_confirmation`. It **never** finalizes the booking — see below. |

Every tool returns the same `{ content: [{ type: "text", text: "..." }], isError?: boolean }`
shape used by MCP-style tool results, so the response text is meant to be
read directly by an LLM (it includes reasons for failures, valid option
lists, and next-step hints), not just parsed programmatically.

## Why `confirm_and_submit` can't finalize the booking

This is the central design decision of the project, so it's worth spelling
out precisely.

Booking a real appointment is a **consequential, hard-to-reverse action** —
it should require the same kind of explicit, deliberate confirmation a human
would give when clicking "Place order" or "Send." An agent that could silently
finalize a booking (even one instructed by its user to "just book it") removes
the one checkpoint where a human notices "wait, that's the wrong date" or
"I didn't mean dental cleaning."

So the two concerns are split by construction, not by convention:

- `confirm_and_submit` validates the form and renders a **review panel** —
  a clearly-labeled preview, explicitly stating *"Nothing has been booked
  yet... booking only happens when you press the button below yourself."*
- The actual state transition to `confirmed` — generating a confirmation ID,
  marking the slot as booked, showing the confirmation panel — happens
  **only** inside a plain `click` event listener on the
  `#confirm-btn` element (see `js/app.js`, the comment reads *"The ONLY code
  path that finalizes a booking. No WebMCP tool calls this."*). That
  listener is never invoked by, referenced by, or reachable from any of the
  four registered tools. There's no tool that dispatches a synthetic click,
  no "auto-confirm" flag, no way to skip the step through repeated tool
  calls — calling `confirm_and_submit` again after it has already staged a
  review just re-validates and re-renders the same review, as its own
  description states.

This means the safety property isn't "the agent was told not to" (a
instruction an agent could misread, or a malicious page could try to
override) — it's "the capability to finalize a booking is not wired to
anything the agent can call, full stop." An agent's *only* way to get a
booking confirmed is to do its job well enough that the human reviewing the
staged summary is happy to click the button themselves.

The same reasoning is why **"Start over" is a plain button, not a tool**
(see `js/app.js` and the note in the tools panel on the page): an agent that
can fill in your form shouldn't also be able to unilaterally throw away your
in-progress data.

## Beyond the four tools

Three more features round out the demo. None of them add a fifth WebMCP
tool — that's deliberate, and consistent with the reasoning above: only
capabilities an agent legitimately needs become tools; everything else stays
human-only UI.

### Action log — the audit trail

The right-hand panel has an **Action log**: a timestamped, chronological
record of every tool call, regardless of where it came from — a real agent
calling through `document.modelContext`, a manual run from the Tool Call
Console below it, or a click on "Review my appointment" (which runs the
exact same `confirm_and_submit` logic a tool call would). Every entry shows
the time, the tool name and arguments, and whether it succeeded or failed.

This works because there is exactly **one** entry point for tool logic in
`js/app.js`: `TOOL_DEFS.forEach(...)` wraps each tool's raw `execute`
function with `instrumentedExecute()`, which logs the call and then invokes
the real implementation — catching and logging any unexpected exception
rather than letting it escape to the calling agent. That single wrapped
function (`def.run`) is what gets registered with `document.modelContext`,
what the console's "Run tool" button calls, and what "Review my appointment"
calls via `runTool("confirm_and_submit", {})`. There's no second, unlogged
path to the same functionality — if it's a tool call, it's in the log.

### Targeted per-field edit from the review screen

Once a booking is staged (`confirm_and_submit` has run and the review panel
is showing), each row in the review — Name, Email, Phone, Appointment type,
Date, Time, Notes — has its own small **Edit** link. Clicking it drops the
booking back to `draft` (same as any edit does) and moves keyboard focus
directly into *that* field, so fixing "oh, wrong date" takes one click and
zero scrolling.

This sits between two existing, coarser options: **"Go back and edit"**
(returns to the top of the form with no specific target) and **"Start
over"** (destroys every field and starts a blank booking). All three remain
available; "Edit \<field\>" is just the fastest path for the common case of
one wrong detail in an otherwise-correct booking.

### Simple / cognitive-load mode

The "Simple mode" toggle above the form is a single, reversible UI mode
aimed at reducing cognitive load, addressing three things at once:

- **Fewer visible options at once** — it hides the entire right-hand
  developer/agent-facing panel (tool list, Action log, Tool Call Console),
  which is irrelevant to someone just trying to book an appointment. The
  page collapses to a single, focused column.
- **Plainer language** — the hint text under each field switches to a
  shorter, more direct phrasing (e.g. "Only weekdays with open slots are
  listed." becomes "Pick a day below. Only open days are shown."), and
  inline field errors drop the agent-directed clause that doesn't help a
  human ("Call describe_current_state to see the valid options.") while
  keeping the actual problem description intact. Critically, this only
  changes what's *displayed in the DOM* — the text returned to an agent by
  a tool call is never altered, since an agent still needs the precise,
  complete version.
- **Larger spacing** — bigger type, more padding around fields and buttons,
  and more breathing room between form sections.

The preference is remembered per-browser via `localStorage` (falling back
silently to "off" if storage is unavailable, e.g. in a locked-down private
browsing mode) and is fully reversible with one click.

## Project structure

```
webmcp-appointment/
├── index.html              Semantic markup only — no inline styles or scripts
├── css/
│   └── styles.css          All styling
├── js/
│   ├── data.js              Pure demo data + date helpers (appointment types,
│   │                        time slots, "already booked" seed data). No DOM
│   │                        access — loads in the browser or in Node.
│   ├── validation.js         Pure field-validation logic. Same module,
│   │                        same reason: testable head-on in Node without a
│   │                        browser.
│   └── app.js               State, DOM wiring, the four WebMCP tool
│                            implementations + registration, the Action log,
│                            the Tool Call Console, and Simple mode.
├── tests/
│   └── validation.test.js   node:test unit tests for js/data.js and
│                            js/validation.js (36 cases).
├── scripts/
│   └── serve.js              Zero-dependency static file server for local dev.
├── TESTING.md               Manual end-to-end test plan (tools + UI + a11y).
├── package.json
└── .gitignore
```

`data.js` and `validation.js` use a small UMD-style wrapper (`if (typeof
module !== "undefined") { module.exports = ... } else { global.X = ... }`) so
the *identical* file is loaded by `<script>` tags in the browser and by
`require()` in the Node test suite — there's exactly one copy of the
validation logic, not a browser copy and a "mirrored for tests" copy that
could drift apart.

`app.js` intentionally stays as a plain `<script>` (not an ES module) so the
page keeps working if opened directly as a `file://` URL — module scripts are
blocked cross-origin by browsers when there's no server involved.

## Accessibility

Accessibility is the core point of this project (an agent-operable form
needs to be legible to *every* kind of user, human or automated), so it's
implemented deliberately, not left as an afterthought:

- **Semantic structure**: a real `<header>`, `<main>`, `<footer>`, `<form>`,
  and `<fieldset>`/`<legend>` groupings; a skip-to-content link; every
  `<label>` is associated with its control via `for`/`id`.
- **Descriptive, always-present error containers**: each field has a
  `role="alert"` error element wired via `aria-describedby` from the very
  start (not added dynamically), so assistive tech announces validation
  errors the instant they appear, and `aria-invalid` is kept in sync on
  every input/select.
- **Two distinct live-region roles, used deliberately**:
  - Per-field errors use `role="alert"` (assertive) — they're contextual,
    tied to one control, and should interrupt.
  - The overall status narration (`#live-status`, `role="status"`,
    `aria-live="polite"`) announces successful transitions — "Full name
    set," "Review ready," "Appointment confirmed" — without re-stating
    validation errors that the per-field alert already covered. This avoids
    the common bug of a screen reader announcing the same problem twice in
    two different tones.
- **Focus management on every state change a human triggers**: staging a
  review moves focus into the (now-visible, `tabindex="-1"`,
  `role="region"`) review panel; confirming moves focus into the confirmed
  panel; going back to edit, cancelling a reset, or starting over all
  explicitly return focus to a sensible control instead of leaving it stranded
  on a now-hidden element (the browser's default behavior when a focused
  element is hidden is to silently drop focus to `<body>`, which is
  disorienting for screen reader and keyboard users alike).
- **Submitting an incomplete form highlights every missing/invalid required
  field at once** (not just the first) and moves focus to the first one —
  the standard accessible "submit attempt" pattern.
- **No keyboard traps, no custom widgets that reinvent native semantics**:
  every control is a native `<input>`, `<select>`, `<textarea>`, or
  `<button>`, so keyboard operability (Tab order, Space/Enter activation,
  native `<select>` arrow-key behavior) comes for free and correctly, rather
  than being reimplemented and risking bugs.
- **The per-field "Edit" links in the review panel** move focus directly
  into the target field rather than just returning to draft status, so
  fixing one detail doesn't require re-locating it in a long form.
- **The Action log** uses `role="log"` (implying a polite, additions-only
  live region) so new entries are announced without re-reading the whole
  history, and its own heading is linked via `aria-labelledby`.
- **"Simple mode" is a standard accessible toggle button**
  (`aria-pressed="true"/"false"`, not a checkbox pretending to be a link or
  vice versa), and switching it announces what changed via the polite status
  region.
- **The destructive "Start over" action never uses a blocking native
  `confirm()` dialog** (those are inaccessible to some assistive tech and
  block all other page interaction); instead it reveals an inline,
  keyboard-operable confirmation row, dismissible with <kbd>Escape</kbd>,
  with focus defaulting to "Cancel" rather than the destructive option.
- **Visible focus indicators**: `:focus-visible` outlines are never
  suppressed.

This was verified by actually driving the page — filling fields, submitting
incomplete/complete forms, staging and confirming a booking, cancelling and
completing the reset flow — and checking `aria-invalid`/error text/live
region content/`document.activeElement` after each step, not just by reading
the markup. See [`TESTING.md`](TESTING.md) for the full checklist, including
a keyboard-only pass and a screen-reader spot-check.

## Running it locally

No build step and no dependencies are required to just open the page:

```bash
# Option A — no server, just open the file (app.js/data.js/validation.js
# are plain scripts, not ES modules, so this works):
open index.html      # macOS
start index.html      # Windows

# Option B — serve it (recommended, closer to how it's deployed):
npm start              # serves the project at http://localhost:5500
```

`npm start` runs `scripts/serve.js`, a ~40-line dependency-free static file
server (uses only Node's built-in `http`/`fs` modules) — nothing to
`npm install` before it works.

## Testing

**Automated:** `js/data.js` and `js/validation.js` are pure functions (no DOM
access), so every validation branch and every date/slot-availability helper
is covered by a Node test suite:

```bash
npm test
```

This runs 36 cases via the built-in `node:test` runner (Node ≥ 18, no test
framework dependency) covering: every required/optional field's valid and
invalid paths, the booked-slot conflict check, the "must pick a date before a
time" ordering rule, unknown-field/unknown-option handling, and the
date-generation and open-slot helpers in `data.js`.

**Manual:** the DOM wiring, the four tools' `execute` functions, the review
→ confirm flow, focus management, and live-region announcements are best
verified by hand in a real browser (that's how they were verified while
building this — see the walkthrough above). [`TESTING.md`](TESTING.md) is a
complete, repeatable test plan: one section per tool, one subsection per
validation path, plus a UI/accessibility checklist.

## Testing with a WebMCP-capable browser or agent

1. **No WebMCP support yet?** Open the page and use the **Tool Call
   Console** in the right-hand panel — it calls the *exact same* `execute`
   functions that get registered with `document.modelContext`, so you can
   pick a tool from the dropdown (an example arguments JSON is pre-filled),
   click "Run tool," and see the exact text response an agent would receive,
   logged with success/error styling.
2. **With WebMCP support** (a browser or extension implementing the
   proposal, exposing `document.modelContext.registerTool` /
   `navigator.modelContext.registerTool`): just load the page. The banner at
   the top switches from the amber "not detected" message to a green
   "✅ WebMCP detected... all four tools are registered" message, and any
   agent with access to that browsing context can enumerate and call
   `describe_current_state`, `list_available_actions`, `complete_form_field`,
   and `confirm_and_submit` directly. A natural test prompt for an agent:
   *"Book me a general checkup on the next available weekday afternoon, my
   name is [X], email [Y]."* — watch it call `describe_current_state` first,
   fill fields one at a time with `complete_form_field`, call
   `confirm_and_submit`, and then correctly stop and tell you a human needs
   to click the button.
3. Either way, open the browser's DevTools console — the page logs a
   `console.error` if a tool fails to register, otherwise it stays silent.
4. Watch the **Action log** in the right-hand panel while an agent works —
   every tool call it makes appears there immediately with a timestamp, so
   you can see exactly what it did without reading the DevTools console.

## Adopting this pattern on your own site

You don't need this whole project to add agent-operable tools to your own
page — the pattern is small enough to copy directly. Here's the recipe this
repo follows, generalized:

1. **Identify the handful of state transitions an agent should be able to
   drive**, and phrase them as tools. A good starting set for almost any
   task mirrors this project's four:
   - one **read-only "describe state" tool** (what's filled in, what's
     missing, what the valid options are right now — an agent should be
     able to call this first and after anything else to reorient itself);
   - one **"what can I do next" tool** (saves the agent from re-deriving
     your state machine's rules itself);
   - one or more **narrow "set one thing" tools** (validate exactly like
     your human-facing UI does, and write into the *real* DOM/state — never
     a shadow copy an agent updates that the human-visible page doesn't
     reflect);
   - if there's a consequential step, a **"stage for confirmation" tool**
     that never itself performs the consequential action (see next point).

2. **Write each tool as a plain function returning a consistent shape**:

   ```js
   function myTool(args) {
     // ...validate/act on args...
     return {
       content: [{ type: "text", text: "Human-readable result, written for an LLM to read." }],
       isError: false // set true on failure — still return, don't throw
     };
   }
   ```

3. **Register with feature detection**, since WebMCP support is still
   inconsistent across browsers:

   ```js
   var mcpTarget =
     (typeof document !== "undefined" && "modelContext" in document) ? document.modelContext :
     (typeof navigator !== "undefined" && "modelContext" in navigator) ? navigator.modelContext :
     null;

   if (mcpTarget && typeof mcpTarget.registerTool === "function") {
     mcpTarget.registerTool({
       name: "my_tool",
       description: "One sentence an LLM will use to decide when to call this.",
       inputSchema: { type: "object", properties: { /* JSON Schema */ }, required: [], additionalProperties: false },
       execute: myTool
     });
   }
   ```

   Provide a manual fallback (this repo's Tool Call Console) that calls the
   *same* `execute` functions, so the feature is testable in any browser
   today, not just ones with WebMCP support.

4. **Keep any hard-to-reverse action wired to a real user gesture, never to
   a tool.** If an action would be bad to trigger accidentally or
   maliciously (submitting a payment, deleting data, sending a message),
   its only code path should be a `click`/`submit` event listener on a real
   button — one that no tool function calls, references, or can synthesize.
   Say so explicitly in that tool's `description`, so an agent reading it
   knows to stop and ask a human rather than looking for a workaround.

5. **Optional, but worth borrowing**: log every tool invocation somewhere
   visible (see `instrumentedExecute()` in `js/app.js`) so a human — or a
   developer debugging the integration — can see exactly what an agent did
   and when, without opening DevTools.

That's the entire pattern: a handful of small, honestly-described functions,
registered behind a feature check, with one clear line an agent structurally
cannot cross.


## Deployment

Deployed as a static site via **GitHub Pages** directly from this repository
(no build step — `index.html` is the entry point at the repo root), serving
the `main` branch from `/ (root)`:

**<https://pipaniaastha.github.io/wepmcp-appointment/>**

To redeploy after changes: push to `main`; GitHub Pages rebuilds
automatically from the configured branch/folder, usually live within a
minute or two.

## Design decisions worth knowing about

- **No framework, no bundler, no dependencies.** The whole point is a small,
  readable surface where the WebMCP tool wiring is easy to find and audit
  (`js/app.js`, search for `TOOL_DEFS`). A build step would add indirection
  without adding capability here.
- **`js/data.js` and `js/validation.js` have zero DOM access on purpose** —
  that's what makes them testable in plain Node without a headless browser.
  `js/app.js` is the only file that touches `document`.
- **Booked slots are seeded relative to "today," not hardcoded dates**, so
  the demo's "this slot is already taken" case stays realistic no matter
  when you load the page (see `ClinicData.seedBookedSlots` in
  `js/data.js`).
