# Manual test plan

This complements the automated suite (`npm test`, `tests/validation.test.js`,
36 cases covering `js/validation.js` and `js/data.js` in isolation). Those
tests don't touch the DOM; everything below does — the tool `execute`
functions, the real form, focus management, and live-region behavior.

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

## 5. Reset ("Start over") — deliberately not a tool

| # | Steps | Expected |
|---|---|---|
| 5.1 | Confirm "Start over" is **not** in the Tool Call Console's tool dropdown and is not one of the four registered tools. | Correct — only `describe_current_state`, `list_available_actions`, `complete_form_field`, `confirm_and_submit` are listed. |
| 5.2 | Fill some fields, click "Start over." | An inline confirmation row appears (no native browser dialog); focus lands on "Cancel." |
| 5.3 | Click "Cancel." | Row hides; entered data is untouched; focus returns to "Start over." |
| 5.4 | Reopen the row (click "Start over" again), press <kbd>Escape</kbd>. | Same as 5.3 — Escape cancels. |
| 5.5 | Reopen the row, click "Yes, clear everything." | All fields clear, status returns to `draft`, focus lands on "Full name." |
| 5.6 | Complete a booking (§4.5), click "Book another appointment." | Form clears immediately (no confirmation needed — the prior booking is already saved), focus lands on "Full name," and the just-booked slot **stays** booked (verify via `describe_current_state`'s open-times line). |

## 6. Accessibility checklist

| # | Check | How |
|---|---|---|
| 6.1 | Full keyboard-only pass | Unplug your mouse (or just don't use it): Tab through the entire page — skip link first, then every field, both buttons, then into the tool console. Confirm nothing is skipped and nothing traps focus. |
| 6.2 | Skip link | Load the page, press Tab once. A "Skip to main content" link should appear top-left and, on Enter, jump focus past the header. |
| 6.3 | Visible focus indicator | Tab through the page; every focused control should have a clearly visible outline (never suppressed). |
| 6.4 | Submitting incomplete form focuses the first error | §4.3 above. |
| 6.5 | Focus never lands on `<body>` after a panel is hidden | Repeat §4.7, §5.5, §5.6, and confirming a booking (§4.5) while watching `document.activeElement` (DevTools: `document.activeElement.id`) — it should always be a real, visible control, never `BODY`. |
| 6.6 | Screen reader spot check | With VoiceOver/NVDA/JAWS running: fill in an invalid email and tab away — the error should be announced immediately. Then successfully stage a review — the polite status line should announce it once, not the error text again. |
| 6.7 | No blocking native dialogs anywhere | Confirm no `alert()`/`confirm()`/`prompt()` is used (search `js/app.js`) — the reset flow uses the inline confirmation row instead. |
| 6.8 | Reduced-width / mobile layout | Resize the browser below ~880px wide — the two-column layout should collapse to one column with no horizontal scrolling. |

## 7. Console / error hygiene

| # | Steps | Expected |
|---|---|---|
| 7.1 | Open DevTools console, reload the page. | No errors. If WebMCP isn't supported, the banner should say so (amber) without any console error — that's an expected, handled path, not a failure. |
| 7.2 | Run every case above with the console open. | No uncaught errors at any point, including the intentionally-invalid inputs above (they should all fail *gracefully*, i.e. return `isError: true` / show an inline message — never throw). |
