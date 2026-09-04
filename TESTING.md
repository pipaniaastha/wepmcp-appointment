# Manual test plan

This complements the automated suite (`npm test`, 77 cases across
`tests/validation.test.js`, `tests/voice.test.js`, and
`tests/interpret.test.js`, covering `js/validation.js`, `js/data.js`,
`js/voice.js`, and `js/interpret.js` in isolation). Those tests don't touch
the DOM; everything below does — the tool `execute` functions, the real
form, focus management, and live-region behavior.

**A note on §5, §10, and §11 (interpret_intent, voice input, and scan
mode):** these three features are implemented to spec but have not been
fully verified with real external dependencies this environment doesn't
have — a real Groq API key and a real model response, a microphone and
real speech, or a physical switch-access device, respectively. (Groq's free
tier removes the *billing* barrier to testing §5 for real — it doesn't
change that this environment still can't sign up for a third-party account
on its own.) Each
section's steps use a documented technique — patching `fetch()` or
`SpeechRecognition`'s prototype methods to return a canned response instead
of hitting the real network/microphone — to exercise the real code path
without any of that hardware/infrastructure. §11 (scan mode) is the one
exception that needed no mocking at all: it uses real timers and real
keyboard events, so it's a full, genuine test of the on-page mechanism —
what's unverified there is specifically the physical switch device, not the
code. See README.md's "`interpret_intent`" and "Voice mapping and
switch-access compatibility" sections for the full disclosure on each.

Setup: `npm start`, open `http://localhost:5500/index.html`. Reload between
sections to reset state, or use the "Start over" button.

You can drive each case two ways: through the on-screen form/buttons (the
"human path"), or through the **Tool Call Console** on the right (the
"agent path," calling the same `execute` functions a WebMCP agent would
call). Cases below are written from whichever path best demonstrates the
behavior; try the other path too where it's called out.

## 1. `describe_current_state`

| # | Steps | Expected |
|---|---|---|
| 1.1 | Load the page. Run `describe_current_state` (console: select it, "Run tool"). | Status `draft`; every field listed as `(empty)`; "Still needed" lists all 5 required fields with their specific error reasons; lists all 9 appointment types, all 6 available dates. |
| 1.2 | Fill `full_name` and `email` only (via form or `complete_form_field`), then run `describe_current_state` again. | Those two fields now show their values (as JSON strings); "Still needed" now lists only the remaining 3 required fields. |
| 1.3 | Fill every required field, then run `describe_current_state`. | "All required fields are valid. Ready for confirm_and_submit." appears; no "Still needed" line. |
| 1.4 | Pick a date, then run `describe_current_state`. | Output includes an "Open times on `<date>`: ..." line listing only unbooked slots for that date. |
| 1.5 | Complete the booking (see §4), then run `describe_current_state`. | Status `confirmed`; a "Confirmation ID: RC-XXXXXX" line appears. |

## 2. `list_available_actions`

| # | Steps | Expected |
|---|---|---|
| 2.1 | Blank form, run `list_available_actions`. | One `complete_form_field(...)` suggestion per missing required field, each with the specific reason. |
| 2.2 | Fill all required fields, run `list_available_actions`. | Suggests `confirm_and_submit({})`. |
| 2.3 | Stage a review (§4.1), run `list_available_actions`. | States a human must click "Confirm & book appointment," and that `complete_form_field` can still be called to change a detail and reopen review. |
| 2.4 | Complete the booking, run `list_available_actions`. | "Nothing further to do — the appointment is already confirmed (ID ...)." |

## 3. `complete_form_field` — one case per validation branch

Run each via the console with `{"field": "...", "value": "..."}`, or by
typing into the matching form control and blurring/changing it.

### full_name
| # | Value | Expected error |
|---|---|---|
| 3.1 | `""` | "Full name is required." |
| 3.2 | `"A"` | "...too short — enter at least 2 characters." |
| 3.3 | 81 `"A"`s | "...too long — 80 characters or fewer, please." |
| 3.4 | `"Jordan123"` | "...can only contain letters, spaces, hyphens and apostrophes." |
| 3.5 | `"Mary-Jane O'Neil"` | **Success.** Field shows a ✓ after its label. |
| 3.6 | `"  Jordan Rivera  "` (leading/trailing spaces) | **Success**, stored trimmed. |

### email
| # | Value | Expected |
|---|---|---|
| 3.7 | `""` | "Email is required." |
| 3.8 | `"not-an-email"` | "Enter a valid email address, e.g. name@example.com." |
| 3.9 | `"jordan@example.com"` | **Success.** |

### phone (optional)
| # | Value | Expected |
|---|---|---|
| 3.10 | `""` | **Success** — optional, no error. |
| 3.11 | `"555-CALL-NOW"` | "...can only contain digits and the usual punctuation ( ) + - ." |
| 3.12 | `"12345"` | "...at least 7 digits, e.g. (555) 123-4567." |
| 3.13 | `"(555) 123-4567"` | **Success.** |

### appointment_type
| # | Value | Expected |
|---|---|---|
| 3.14 | `""` | "Please choose an appointment type." |
| 3.15 | `"brain_surgery"` | "...isn't a recognized appointment type. Call describe_current_state..." |
| 3.16 | each of the 9 listed values (`general_checkup`, `dental_cleaning`, `physical_therapy`, `vaccination`, `follow_up`, `specialist_consult`, `telehealth`, `lab_work`, `mental_health`) | **Success** for all 9. |

### date
| # | Value | Expected |
|---|---|---|
| 3.17 | `""` | "Please choose a date." |
| 3.18 | An ISO date for a Saturday/Sunday, or any date not in `describe_current_state`'s available-dates list | "That date isn't open for booking..." |
| 3.19 | Any date from the available-dates list | **Success.** The Preferred-time `<select>` repopulates. |
| 3.20 | With a time already chosen, change the date to one where that time is booked | Time is silently cleared back to "— Select a time —" (verify via `describe_current_state` or the visible select). |

### time
| # | Value | Expected |
|---|---|---|
| 3.21 | `""` (no date chosen yet) | "Choose a date before a time." |
| 3.22 | `""` (date already chosen) | "Please choose a time." |
| 3.23 | `"23:59"` | "...isn't a clinic time slot. Valid slots are 09:00, 10:30, 13:00, 14:30, 16:00." |
| 3.24 | The seeded booked slot for the 2nd available date (10:30) or the 4th (13:00) — check `describe_current_state`'s open-times line to confirm which is booked "today" | "That time is already booked on the selected date. Choose another time." |
| 3.25 | An open slot on a valid date | **Success.** |

### notes (optional)
| # | Value | Expected |
|---|---|---|
| 3.26 | `""` | **Success.** |
| 3.27 | 300 chars | **Success.** |
| 3.28 | 301 chars | "Notes must be 300 characters or fewer (currently 301)." |

### misc
| # | Steps | Expected |
|---|---|---|
| 3.29 | `complete_form_field` with no `field` argument | `isError: true`, "Missing required argument: field" |
| 3.30 | `complete_form_field({field: "favorite_color", value: "blue"})` | `isError: true`, "Unknown field: favorite_color. Valid fields are ..." |
| 3.31 | Successfully set any field while the booking is `awaiting_confirmation` (stage review first, see §4.1) | Status silently drops back to `draft`; review panel hides. |

## 4. `confirm_and_submit` and the human-only confirm step

| # | Steps | Expected |
|---|---|---|
| 4.1 | Fill all required fields validly, run `confirm_and_submit`. | Success text explicitly says the tool "cannot finalize the booking itself" and names the button. Status → `awaiting_confirmation`. Review panel becomes visible with all entered values. |
| 4.2 | With required fields still missing, run `confirm_and_submit`. | `isError: true`; message lists every missing/invalid required field. **Also check the form**: every listed field now shows its error inline (not just in the tool response). |
| 4.3 | Click "Review my appointment" on a blank form (human path). | Same as 4.2, and additionally: keyboard focus lands on the first invalid field (`full_name`). |
| 4.4 | After staging (4.1), search the page for any button or tool that finalizes the booking besides the literal "Confirm & book appointment" button. | There isn't one — confirm this by reading `js/app.js`: only one `click` listener (on `#confirm-btn`) ever sets `status = "confirmed"`. |
| 4.5 | Click "Confirm & book appointment." | Status → `confirmed`. Confirmed panel shows a confirmation ID and a summary sentence. The booked date/time becomes unavailable if you start a new booking attempt for the same slot. Keyboard focus lands inside the confirmed panel. |
| 4.6 | After confirming, run `confirm_and_submit` again. | "Already confirmed. Confirmation ID .... Nothing to do." — does not create a second booking or ID. |
| 4.7 | Stage a review (4.1), then click "Go back and edit." | Status returns to `draft`; review panel hides; focus returns to the "Review my appointment" button. |

## 5. `interpret_intent` (implemented to spec — see the note at the top of this file)

Section 5.1 tests the honest-refusal path, which needs no key and no
network mocking at all. Sections 5.2+ need the fetch-mocking technique
below, which safely exercises the real tool/validation pipeline without a
real Groq key or any real network call — the same kind of substitution
used for `SpeechRecognition` in §10. Note that a real response from
`openai/gpt-oss-20b` in Groq's strict JSON-schema mode always includes
every one of the four `resolved` keys, using `null` (never omission) for
anything it didn't resolve — the mocked responses below use that same
realistic shape.

| # | Steps | Expected |
|---|---|---|
| 5.1 | With no Groq key configured (default state, or after clicking "Clear key"), run `interpret_intent({"text": "book me something Tuesday afternoon"})`. | `isError: true`; message explains no key is configured and that the tool "never guesses without one" — **no network request is attempted** (check the Network tab: nothing to `api.groq.com`). |
| 5.2 | Paste any placeholder text into "Groq API key" and click "Save key." | Status line switches to "✅ Key configured — interpret_intent will make real calls to Groq using it (free tier available)."; the input clears; `localStorage.getItem("webmcp-appointment:groq-key")` now holds the value. |
| 5.3 | In DevTools, mock the network call and capture the real outgoing request (paste into the console): `var rf = window.fetch; window.__req = null; window.fetch = function(u,o){ if(String(u).indexOf("api.groq.com")===-1) return rf(u,o); window.__req = {url:u, body:JSON.parse(o.body)}; return Promise.resolve({ok:true, json:()=>Promise.resolve({choices:[{message:{content: window.__mock}}]}), text:()=>Promise.resolve("")}); };` then set `window.__mock` to a JSON string and run `interpret_intent`. | Sets up safe, hardware/network-free testing of the real pipeline. |
| 5.3a | After any call in this section, inspect `window.__req`. | `url` is `https://api.groq.com/openai/v1/chat/completions`; `body.model` is `"openai/gpt-oss-20b"`; `body.response_format` is `{type:"json_schema", json_schema:{name:"interpret_intent_result", strict:true, schema:{...}}}` with the schema's `resolved` sub-object requiring all four field names with `type:["string","null"]` each — confirming the real request matches Groq's documented strict-mode shape, not just that a response gets handled. |
| 5.4 | `window.__mock = JSON.stringify({resolved:{appointment_type:"general_checkup", date:"<a real available date from describe_current_state>", time:"<a real open time on that date>", notes:null}, unresolved:[], clarification:""})`, then run `interpret_intent({"text":"book me something Tuesday afternoon for a check-up"})`. | All three fields are actually set on the real form (check `describe_current_state` or the visible selects); the `null` `notes` field is left untouched, not treated as an error; result text lists what was set; live-status announces it. |
| 5.5 | `window.__mock = JSON.stringify({resolved:{appointment_type:null,date:null,time:null,notes:null}, unresolved:["appointment_type","date","time"], clarification:"What kind of appointment do you need, and when?"})`, run `interpret_intent({"text":"whenever's soonest, I don't really mind"})`. | `isError: true` (nothing was set); result text includes "Could not confidently resolve" and the clarification question; **no field changes** — the tool asks rather than guesses. |
| 5.6 | `window.__mock = JSON.stringify({resolved:{appointment_type:"dental_cleaning", date:"<a real date>", time:"<a time that IS already booked on that date, per describe_current_state's open-times line>", notes:null}, unresolved:[], clarification:""})`, run `interpret_intent`. | `appointment_type` and `date` **are** set (they were valid); `time` is **rejected** — result text includes "Rejected — reasoning does not bypass validation" with the real "already booked" message. This is the direct proof that a confident-sounding AI answer doesn't bypass validation. |
| 5.7 | `window.__mock = "Sure, I think you'd like a dental cleaning."` (not JSON), run `interpret_intent`. | `isError: true`; "The AI's response couldn't be used: ...wasn't valid JSON..."; no fields touched; no crash. |
| 5.8 | Mock a non-OK response instead (`ok:false, status:401, text:()=>Promise.resolve('{"error":"bad key"}')`), run `interpret_intent`. | `isError: true`; "Couldn't reach the AI interpreter: Groq API error 401: ..."; no fields touched. |
| 5.9 | Run `interpret_intent({})` (no `text`). | `isError: true`, "Missing required argument: text" — no network call attempted. |
| 5.10 | Repeat 5.4 via the "Review my appointment" area is N/A here (interpret_intent has no button alias, unlike confirm_and_submit) — instead confirm it appears correctly in the **Action log**: timestamp, `interpret_intent({"text":"..."})`, and the ✓/✗ result. | Logged identically to every other tool call — no special-casing. |
| 5.11 | Click "Clear key," then repeat 5.1. | Same honest refusal as 5.1 — clearing genuinely removes the key, not just hides the UI (`localStorage.getItem("webmcp-appointment:groq-key")` is `null`). |

## 6. Reset ("Start over") — deliberately not a tool

| # | Steps | Expected |
|---|---|---|
| 6.1 | Confirm "Start over" is **not** in the Tool Call Console's tool dropdown and is not one of the five registered tools. | Correct — only `describe_current_state`, `list_available_actions`, `complete_form_field`, `confirm_and_submit`, `interpret_intent` are listed. |
| 6.2 | Fill some fields, click "Start over." | An inline confirmation row appears (no native browser dialog); focus lands on "Cancel." |
| 6.3 | Click "Cancel." | Row hides; entered data is untouched; focus returns to "Start over." |
| 6.4 | Reopen the row (click "Start over" again), press <kbd>Escape</kbd>. | Same as 6.3 — Escape cancels. |
| 6.5 | Reopen the row, click "Yes, clear everything." | All fields clear, status returns to `draft`, focus lands on "Full name." |
| 6.6 | Complete a booking (§4.5), click "Book another appointment." | Form clears immediately (no confirmation needed — the prior booking is already saved), focus lands on "Full name," and the just-booked slot **stays** booked (verify via `describe_current_state`'s open-times line). |

## 7. Action log

| # | Steps | Expected |
|---|---|---|
| 7.1 | Load the page (form blank). | The Action log shows "No tool calls yet." |
| 7.2 | Run `describe_current_state` from the console. | A new entry appears: timestamp, `describe_current_state({})`, and the ✓ result text. "No tool calls yet." is gone. |
| 7.3 | Run `complete_form_field` with an invalid value (e.g. `{"field":"email","value":"bad"}`). | A new entry appears styled as an error (✗), showing the failure text. |
| 7.4 | Click "Review my appointment" on the human path (not the console) with all required fields valid. | A `confirm_and_submit({})` entry appears in the log, exactly as if an agent had called the tool — confirming the button and the tool share one logged code path. |
| 7.5 | Submit `{"field": "??", "value": "x"}` (not valid JSON, e.g. leave a trailing comma) into the console's Arguments box and click "Run tool." | An inline "Invalid JSON arguments" message appears near the console — **no** entry is added to the Action log, since no tool was actually invoked. |
| 7.6 | Click "Clear log." | The log empties and "No tool calls yet." reappears. |
| 7.7 | Make several calls in a row (mix of console and human-path actions, including an `interpret_intent` call per §5). | Entries appear in chronological order, each with a distinct, increasing timestamp, and the log auto-scrolls to show the latest. |

## 8. Targeted per-field edit from the review screen

| # | Steps | Expected |
|---|---|---|
| 8.1 | Fill in a valid booking, stage it (§4.1), and locate the "Edit" link next to "Email" in the review panel. | The link is a real, keyboard-focusable `<button>` (reachable via Tab), not a plain link or a div with a click handler. |
| 8.2 | Click "Edit" next to "Email." | Status returns to `draft`, the review panel hides, and keyboard focus lands directly in the Email field (not at the top of the form, not on "Review my appointment"). |
| 8.3 | Change the email, then click "Review my appointment" again. | The review panel re-appears showing the updated email and all other fields unchanged. |
| 8.4 | Repeat 8.1–8.3 for each of the other six rows (Name, Phone, Appointment type, Date, Time, Notes). | Each "Edit" link focuses its own field correctly, including the optional ones (Phone, Notes) even when they show "(not provided)"/"(none)". |
| 8.5 | Clicking "Edit" on any field. | Confirm this does **not** create an Action log entry (it's a plain UI navigation, not a tool call — only actually setting a field value via `complete_form_field`/the field's own change event would log, and only if done through the console or an agent). |

## 9. Simple / cognitive-load mode

| # | Steps | Expected |
|---|---|---|
| 9.1 | Load the page fresh (no prior toggle in this browser), check the "Simple mode" button. | Shows "🔎 Simple mode: Off", `aria-pressed="false"`, right-hand tools panel visible, normal spacing. |
| 9.2 | Click "Simple mode." | Button switches to "✅ Simple mode: On", `aria-pressed="true"`; the entire right-hand panel (tool list, AI interpreter setup, Action log, Tool Call Console) disappears; the form column widens to fill the page; text and controls visibly enlarge; live-status announces the change. |
| 9.3 | With Simple mode on, inspect the hint text under Full name, Phone, Preferred date, Preferred time, and Notes. | Each shows the shorter, plainer variant (e.g. "Pick a day below. Only open days are shown." instead of "Only weekdays with open slots are listed."). |
| 9.4 | With Simple mode on, run `complete_form_field` with an invalid appointment type via the console (`{"field":"appointment_type","value":"nope"}`). | The inline field error shown **on the page** omits the "Call describe_current_state to see the valid options" clause (e.g. `"nope" isn't a recognized appointment type.`), but the **Action log entry** for that same call still shows the full, unedited tool response text including the clause — confirming the trim is display-only, never applied to what an agent reads. |
| 9.5 | Click "Simple mode" again to turn it off, with that error still showing. | Tools panel reappears, spacing/type return to normal, hint text reverts to the original wording. The appointment-type error **re-derives from the field's actual stored value**, not from re-un-trimming the old message: since a rejected value is never written to state (only valid ones are), if the field is still genuinely empty it now shows "Please choose an appointment type." (`aria-invalid` stays `"true"`); if you'd set a valid value in between, the error clears entirely and `aria-invalid` becomes `"false"`. Either way, `aria-invalid` always matches whether the field is genuinely currently valid — confirm this by toggling mode a second time and checking the error/`aria-invalid` are unchanged (not flip-flopping). |
| 9.6 | Reload the page after leaving Simple mode on. | The page loads with Simple mode already on (persisted via `localStorage`) — button shows "On" and the tools panel is hidden from the very first render, with no announcement (silent on load). |
| 9.7 | Toggle back off, and confirm via keyboard only (Tab to the button, press Enter/Space). | Works identically to a mouse click — it's a real `<button>`. |

## 10. Voice mapping (implemented to spec — see the note at the top of this file)

Section 10.1–10.2 need only a browser with `SpeechRecognition` support (check
`"SpeechRecognition" in window || "webkitSpeechRecognition" in window` in
DevTools). Section 10.3 needs the prototype-patch technique below, which
avoids opening a real microphone or triggering an OS permission prompt —
useful in any environment without a mic, and the technique this project's
own testing used.

| # | Steps | Expected |
|---|---|---|
| 10.1 | Load the page in a browser with no `SpeechRecognition` support (or check the logic by reading `js/app.js`'s `voiceSupported` check). | Every 🎤 button is `disabled` with `title="Voice input isn't supported in this browser."`, and the note under the status line says voice input isn't available. |
| 10.2 | Load the page in a browser that has `SpeechRecognition` support. | Every 🎤 button is enabled with `title="Speak this field's value"`, and the note says voice input is available. **Do not click one without a real microphone available** — it will prompt for microphone permission. |
| 10.3 | In DevTools, patch the recognition constructor before testing (paste into the console): `var C = window.SpeechRecognition \|\| window.webkitSpeechRecognition; C.prototype.start = function(){ var s=this; setTimeout(function(){ if(s.onresult) s.onresult({results:[[{transcript: window.__t}]]}); if(s.onend) s.onend(); }, 50); }; C.prototype.abort = function(){ if(this.onend) this.onend(); };` then for each case below, set `window.__t = "<transcript>"` and click the field's mic button. | Sets up safe, hardware-free testing of the real code path (see README's verification-status note for why this is a legitimate substitute for the audio-capture step only, not a substitute for real hardware testing). |
| 10.4 | `window.__t = "Jordan Rivera"`, click Full name's mic. | Full name field fills with "Jordan Rivera"; live-status: `Heard "Jordan Rivera" for Full name.` |
| 10.5 | `window.__t = "jordan dot rivera at example dot com"`, click Email's mic. | Email field fills with `jordan.rivera@example.com` (spoken "dot"/"at" converted). |
| 10.6 | `window.__t = "<the exact label text of any appointment type option>"`, click Appointment type's mic. | That option is selected. |
| 10.7 | `window.__t = "underwater basket weaving"`, click Appointment type's mic. | Field is **not** changed; live-status: `Didn't recognize "underwater basket weaving" as an appointment type. Try saying it as shown in the dropdown, or select it manually.` (note "an," not "a" — grammar bug found and fixed during development). |
| 10.8 | With no date chosen, `window.__t = "9:00 AM"`, click Preferred time's mic. | Live-status shows the real validation message `Preferred time: Choose a date before a time.` — not a "didn't understand" message (an earlier version of this feature showed the wrong, more confusing message here; fixed during development — see §10.9 for the regression check). |
| 10.9 | Choose a date first, then repeat 10.8 with the label text of an actually-open time slot. | That time is selected; live-status: `Heard "<label>" — set Preferred time.` |
| 10.10 | Click a mic button to start listening, then click it again before it finishes. | Listening stops immediately (recognition aborted); the field is unchanged; the button's `listening` class and `aria-pressed` clear. |
| 10.11 | Click one field's mic button, then try clicking a different field's mic button while the first is still listening. | The second button is disabled and unclickable until the first finishes or is cancelled — only one recognition session at a time. |
| 10.12 | Complete all seven fields via voice (10.4–10.9 shape), then run `describe_current_state`. | Every field shows the correct, fully-validated value — a voice-only booking reaches the same valid state a typed one would. |

## 11. Switch-access: scan mode (implemented to spec — see the note at the top of this file)

Every step below is a genuine, hardware-free test of the real on-page
mechanism (real timers, real keyboard events) — nothing here is mocked.
What it cannot test is a physical switch device itself.

| # | Steps | Expected |
|---|---|---|
| 11.1 | Load the page, locate "Scan mode" next to "Simple mode." | Shows "🔁 Scan mode: Off", `aria-pressed="false"`. A "Scan speed" `<select>` next to it defaults to 1.5 seconds. |
| 11.2 | Set the scan speed to 1 second, click "Scan mode." | Button switches to "⏹️ Scan mode: On", `aria-pressed="true"`; live-status announces `Scan mode on. Focus will move automatically every 1 second. Press Escape or the button again to stop.` (singular "second," not "1 seconds" — grammar bug found and fixed during development). |
| 11.3 | Focus a button (not a text field), then wait a couple of seconds (more if the browser tab isn't focused — see the throttling note below). | Focus visibly moves to the next reachable control in DOM order, then the next, wrapping around at the end back to the first. |
| 11.3a | **Regression test for a real bug** (reported by a user via manual testing, reproduced, and fixed — see README's Scan mode section): turn Scan mode on and then do **nothing at all** — no click, no keypress, no field interaction — for at least 4-5 interval lengths (e.g. ~7-8 seconds at the default 1.5s). | Focus keeps moving the whole time and visibly passes through "Full name" (and every other text field) without ever getting stuck. The original bug: focus would freeze permanently the instant it reached the *first* text field, with zero way to recover short of pressing Escape — confirm this does **not** happen. `document.activeElement.id` should be different from what it was a few ticks ago at every check. |
| 11.4 | Manually Tab (or click) into a text field (Full name, Email, Phone, or Notes) while scan mode is on, but **don't type anything**, then wait several seconds. | Focus **keeps advancing** — landing on an untouched text field is not by itself a reason to pause (this is the corrected behavior; merely being focused there no longer freezes scanning). |
| 11.4a | Tab/click into a text field, then actually **type a character** into it (a real keystroke, not just `.value = "..."` — dispatch a real `input` event if testing programmatically), then wait several seconds. | Focus **stays** in that field for as long as you keep typing — scanning genuinely pauses only once real typing activity is detected. |
| 11.5 | Type something into a field per 11.4a (so scanning is paused there), then Tab or click out of it to any other control. | Scanning resumes advancing from wherever focus now is. |
| 11.6 | While scanning, press <kbd>Escape</kbd>. | Scanning stops immediately: button reverts to "Scan mode: Off," `aria-pressed="false"`, live-status announces it, and focus stops moving (confirm by waiting afterward — it should not jump again). |
| 11.7 | Turn Simple mode on while Scan mode is also on. | The scan list immediately stops including anything inside the now-hidden tools panel — focus only ever lands on genuinely visible controls. |
| 11.8 | Click "Start over" while scan mode is on (revealing the confirm row), and keep watching. | Scanning reaches "Yes, clear everything" and "Cancel" once that row is visible — the scan list is recomputed live, not built once at page load. |
| 11.9 | Change the scan-speed dropdown while scanning is already on. | The new interval takes effect immediately (no need to toggle off and on again). |
| 11.10 | Full keyboard-only pass, including the new controls. | Tab through the entire page — skip link, mode-bar toggles, scan-speed select, every field plus its mic button, form actions, the AI interpreter key input, and the tools panel — confirm every mic button, "Scan mode," and the scan-speed select are all individually reachable and operable via keyboard alone. |
| 11.11 | **Timer throttling note** | If the browser window/tab isn't the OS-focused one (common when testing via automation), Chrome throttles `setInterval` below the requested rate as a power-saving measure — scanning will still advance to the *correct* next element, just more slowly than the selected interval. This is expected browser behavior, not a bug; for accurate timing, keep the tab focused and visible. |

## 12. Accessibility checklist

| # | Check | How |
|---|---|---|
| 12.1 | Full keyboard-only pass | Unplug your mouse (or just don't use it): Tab through the entire page — skip link first, then every field (and its mic button), the mode-bar and access-bar controls, the AI interpreter key input, then into the tool console. Confirm nothing is skipped and nothing traps focus. |
| 12.2 | Skip link | Load the page, press Tab once. A "Skip to main content" link should appear top-left and, on Enter, jump focus past the header. |
| 12.3 | Visible focus indicator | Tab through the page; every focused control should have a clearly visible outline (never suppressed). |
| 12.4 | Submitting incomplete form focuses the first error | §4.3 above. |
| 12.5 | Focus never lands on `<body>` after a panel is hidden | Repeat §4.7, §6.5, §6.6, §8.2, and confirming a booking (§4.5) while watching `document.activeElement` (DevTools: `document.activeElement.id`) — it should always be a real, visible control, never `BODY`. |
| 12.6 | Screen reader spot check | With VoiceOver/NVDA/JAWS running: fill in an invalid email and tab away — the error should be announced immediately. Then successfully stage a review — the polite status line should announce it once, not the error text again. Also confirm a new Action log entry is announced without the whole log being re-read. |
| 12.7 | No blocking native dialogs anywhere | Confirm no `alert()`/`confirm()`/`prompt()` is used (search `js/app.js`) — the reset flow uses the inline confirmation row instead, and voice/scan/interpret_intent errors all go through the same `announce()`/`role="alert"` mechanisms as everything else. |
| 12.8 | Reduced-width / mobile layout | Resize the browser below ~880px wide — the two-column layout should collapse to one column with no horizontal scrolling (with or without Simple mode). |

## 13. Console / error hygiene

| # | Steps | Expected |
|---|---|---|
| 13.1 | Open DevTools console, reload the page. | No errors. If WebMCP isn't supported, the banner should say so (amber) without any console error — that's an expected, handled path, not a failure. |
| 13.2 | Run every case above with the console open. | No uncaught errors at any point, including the intentionally-invalid inputs above (they should all fail *gracefully*, i.e. return `isError: true` / show an inline message — never throw). Any thrown error inside a tool — including a rejected `fetch()` in `interpret_intent` — is caught by `instrumentedExecute` and surfaced as a normal `isError: true` result, logged like any other call. |
