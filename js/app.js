(function () {
  "use strict";

  // ---------- Demo data (from js/data.js) ----------
  var APPOINTMENT_TYPES = ClinicData.APPOINTMENT_TYPES;
  var TIME_SLOTS = ClinicData.TIME_SLOTS;
  var TIME_LABELS = ClinicData.TIME_LABELS;
  var humanDate = ClinicData.humanDate;
  var openTimesFor = ClinicData.openTimesFor;

  var AVAILABLE_DATES = ClinicData.buildAvailableDates();
  // Mutable copy: confirming a booking adds to it during the session.
  var BOOKED_SLOTS = ClinicData.seedBookedSlots(AVAILABLE_DATES);

  // ---------- Validation (from js/validation.js) ----------
  var FIELD_ORDER = Validation.FIELD_ORDER;
  var REQUIRED_FIELDS = Validation.REQUIRED_FIELDS;
  var fieldLabel = Validation.fieldLabel;

  function validationContext() {
    return {
      appointmentTypes: APPOINTMENT_TYPES,
      availableDates: AVAILABLE_DATES,
      timeSlots: TIME_SLOTS,
      bookedSlots: BOOKED_SLOTS,
      selectedDate: state.fields.date
    };
  }
  function validateField(field, value) {
    return Validation.validateField(field, value, validationContext());
  }
  function missingOrInvalidFields() {
    return Validation.missingOrInvalidFields(state.fields, validationContext());
  }

  function emptyFields() {
    var f = {};
    FIELD_ORDER.forEach(function (name) { f[name] = ""; });
    return f;
  }

  // ---------- App state ----------
  var state = {
    status: "draft", // draft | awaiting_confirmation | confirmed
    fields: emptyFields(),
    confirmationId: null
  };

  // ---------- Simple / cognitive-load mode ----------
  var SIMPLE_MODE_KEY = "webmcp-appointment:simple-mode";
  var simpleMode = false;
  try {
    simpleMode = localStorage.getItem(SIMPLE_MODE_KEY) === "1";
  } catch (e) {
    // localStorage can throw in some locked-down/private-browsing contexts;
    // fall back to the default (off) rather than breaking the page.
  }

  // ---------- DOM refs ----------
  var els = {};
  FIELD_ORDER.forEach(function (f) { els[f] = document.getElementById(f); });
  var liveStatus = document.getElementById("live-status");
  var statusBadge = document.getElementById("status-badge");
  var reviewPanel = document.getElementById("review-panel");
  var reviewFields = document.getElementById("review-fields");
  var confirmedPanel = document.getElementById("confirmed-panel");
  var confirmationText = document.getElementById("confirmation-text");
  var resetBtn = document.getElementById("reset-btn");
  var resetConfirmRow = document.getElementById("reset-confirm-row");
  var manualReviewBtn = document.getElementById("manual-review-btn");
  var toolsPanel = document.getElementById("tools-panel");
  var simpleModeToggle = document.getElementById("simple-mode-toggle");
  var actionLog = document.getElementById("action-log");

  // ---------- Populate static selects ----------
  APPOINTMENT_TYPES.forEach(function (t) {
    var opt = document.createElement("option");
    opt.value = t.value; opt.textContent = t.label;
    els.appointment_type.appendChild(opt);
  });
  AVAILABLE_DATES.forEach(function (iso) {
    var opt = document.createElement("option");
    opt.value = iso; opt.textContent = humanDate(iso);
    els.date.appendChild(opt);
  });

  function refreshTimeOptions() {
    var dateIso = state.fields.date;
    els.time.innerHTML = "";
    if (!dateIso) {
      var opt0 = document.createElement("option");
      opt0.value = ""; opt0.textContent = "— Select a date first —";
      els.time.appendChild(opt0);
      return;
    }
    var open = openTimesFor(dateIso, BOOKED_SLOTS);
    var placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = open.length ? "— Select a time —" : "— No open times this day —";
    els.time.appendChild(placeholder);
    open.forEach(function (t) {
      var opt = document.createElement("option");
      opt.value = t; opt.textContent = TIME_LABELS[t];
      els.time.appendChild(opt);
    });
  }
  refreshTimeOptions();

  // ---------- Field error / filled-state display ----------
  // Error text is written once by validateField and reused verbatim for both
  // the tool response (read by an agent) and the inline DOM message (read by
  // a human). In simple mode we trim the agent-directed "call this tool"
  // clause from the human-facing copy only — the canonical message returned
  // to tools is never altered.
  function humanizeErrorForDisplay(message) {
    if (!simpleMode || !message) return message;
    return message.replace(/\s*Call describe_current_state to see the [^.]*\.\s*$/, "");
  }

  function setFieldError(field, message) {
    var errEl = document.getElementById(field + "-error");
    var input = els[field];
    var wrap = document.getElementById("field-" + field);
    if (errEl) errEl.textContent = message ? humanizeErrorForDisplay(message) : "";
    if (input) input.setAttribute("aria-invalid", message ? "true" : "false");
    if (wrap) wrap.classList.toggle("filled", !message && !!state.fields[field]);
  }

  // Polite, page-level narration of *successful* transitions and staged
  // actions. Per-field validation problems are announced separately by the
  // field's own `role="alert"` element (assertive, contextual) so screen
  // reader users aren't told the same thing twice in two different tones.
  function announce(msg) {
    liveStatus.textContent = msg;
  }

  function setStatus(newStatus) {
    state.status = newStatus;
    var labels = { draft: "Draft", awaiting_confirmation: "Awaiting human confirmation", confirmed: "Confirmed" };
    var classes = { draft: "status-draft", awaiting_confirmation: "status-review", confirmed: "status-confirmed" };
    statusBadge.textContent = labels[newStatus];
    statusBadge.className = "status-badge " + classes[newStatus];
    reviewPanel.hidden = newStatus !== "awaiting_confirmation";
    confirmedPanel.hidden = newStatus !== "confirmed";
  }

  function hideResetConfirm() {
    resetConfirmRow.hidden = true;
  }

  // ---------- Core field-setting logic (shared by DOM inputs and tools) ----------
  function applyFieldValue(field, rawValue) {
    if (FIELD_ORDER.indexOf(field) === -1) {
      return { ok: false, error: "Unknown field: " + field + ". Valid fields are " + FIELD_ORDER.join(", ") + "." };
    }
    var error = validateField(field, rawValue);
    if (error) {
      setFieldError(field, error);
      return { ok: false, error: error };
    }
    var value = (rawValue === undefined || rawValue === null) ? "" : String(rawValue).trim();
    state.fields[field] = value;
    if (els[field]) els[field].value = value;
    setFieldError(field, null);
    if (!resetConfirmRow.hidden) hideResetConfirm();

    if (field === "date") {
      // Changing the date can invalidate a previously chosen time.
      refreshTimeOptions();
      if (state.fields.time && (BOOKED_SLOTS[value + "|" + state.fields.time] || TIME_SLOTS.indexOf(state.fields.time) === -1)) {
        state.fields.time = "";
        els.time.value = "";
        setFieldError("time", null);
      } else if (els.time) {
        els.time.value = state.fields.time || "";
      }
    }

    if (state.status === "awaiting_confirmation") {
      // Any edit after staging pulls the booking back for re-review — never
      // silently re-confirm changed details.
      setStatus("draft");
    }

    return { ok: true };
  }

  function renderReview() {
    reviewFields.innerHTML = "";
    var rows = [
      ["full_name", "Name", state.fields.full_name],
      ["email", "Email", state.fields.email],
      ["phone", "Phone", state.fields.phone || "(not provided)"],
      ["appointment_type", "Appointment type", (APPOINTMENT_TYPES.filter(function (t) { return t.value === state.fields.appointment_type; })[0] || {}).label || state.fields.appointment_type],
      ["date", "Date", humanDate(state.fields.date)],
      ["time", "Time", TIME_LABELS[state.fields.time] || state.fields.time],
      ["notes", "Notes", state.fields.notes || "(none)"]
    ];
    rows.forEach(function (r) {
      var field = r[0], label = r[1], value = r[2];
      var dt = document.createElement("dt"); dt.textContent = label;
      var dd = document.createElement("dd");
      var valueSpan = document.createElement("span");
      valueSpan.className = "review-value";
      valueSpan.textContent = value;
      var editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "edit-field-btn";
      editBtn.textContent = "Edit";
      editBtn.setAttribute("data-field", field);
      editBtn.setAttribute("aria-label", "Edit " + label.toLowerCase());
      dd.appendChild(valueSpan);
      dd.appendChild(editBtn);
      reviewFields.appendChild(dt);
      reviewFields.appendChild(dd);
    });
  }

  // Targeted undo: jump straight back to one field from the review screen,
  // instead of the generic "Go back and edit" (which returns focus to the
  // top of the form) or the full "Start over" reset.
  reviewFields.addEventListener("click", function (e) {
    var btn = e.target.closest ? e.target.closest("button[data-field]") : null;
    if (!btn) return;
    var field = btn.getAttribute("data-field");
    setStatus("draft");
    announce("Editing " + fieldLabel(field) + ". Update it, then click Review my appointment again when ready.");
    if (els[field]) els[field].focus();
  });

  function stateSummaryText() {
    var lines = [];
    lines.push("Status: " + state.status + ".");
    FIELD_ORDER.forEach(function (f) {
      var v = state.fields[f];
      lines.push("- " + fieldLabel(f) + ": " + (v ? JSON.stringify(v) : "(empty)"));
    });
    var problems = missingOrInvalidFields();
    if (problems.length) {
      lines.push("Still needed: " + problems.map(function (p) { return p.label + " (" + p.error + ")"; }).join("; "));
    } else if (state.status === "draft") {
      lines.push("All required fields are valid. Ready for confirm_and_submit.");
    }
    if (state.status === "confirmed") {
      lines.push("Confirmation ID: " + state.confirmationId);
    }
    lines.push("Available appointment types: " + APPOINTMENT_TYPES.map(function (t) { return t.value; }).join(", "));
    lines.push("Available dates: " + AVAILABLE_DATES.join(", "));
    if (state.fields.date) {
      lines.push("Open times on " + state.fields.date + ": " + openTimesFor(state.fields.date, BOOKED_SLOTS).join(", "));
    }
    return lines.join("\n");
  }

  // ---------- Reset ("start over") — deliberately UI-only, not a tool ----------
  function resetForm() {
    state.fields = emptyFields();
    state.confirmationId = null;
    FIELD_ORDER.forEach(function (f) {
      if (els[f]) els[f].value = "";
      setFieldError(f, null);
    });
    refreshTimeOptions();
    reviewFields.innerHTML = "";
    setStatus("draft");
  }

  // ---------- Wire up manual DOM interaction (non-agent path) ----------
  FIELD_ORDER.forEach(function (f) {
    var el = els[f];
    if (!el) return;
    el.addEventListener("change", function () {
      var result = applyFieldValue(f, el.value);
      if (result.ok) {
        announce(fieldLabel(f) + " set.");
      }
      // On failure, the field's own role="alert" error message already
      // announces the problem — no need to also speak it via live-status.
    });
  });

  manualReviewBtn.addEventListener("click", function () {
    // Runs through the same instrumented path as a real agent tool call
    // (see runTool below), so it shows up in the Action log too — clicking
    // this button performs literally the same action confirm_and_submit does.
    var res = runTool("confirm_and_submit", {});
    if (res.isError) {
      var problems = missingOrInvalidFields();
      if (problems.length) {
        problems.forEach(function (p) { setFieldError(p.field, p.error); });
        if (els[problems[0].field]) els[problems[0].field].focus();
      }
    } else {
      reviewPanel.focus();
    }
  });

  document.getElementById("edit-btn").addEventListener("click", function () {
    setStatus("draft");
    announce("Back to editing.");
    manualReviewBtn.focus();
  });

  // The ONLY code path that finalizes a booking. No WebMCP tool calls this.
  document.getElementById("confirm-btn").addEventListener("click", function () {
    if (state.status !== "awaiting_confirmation") return;
    state.confirmationId = "RC-" + Math.random().toString(36).slice(2, 8).toUpperCase();
    setStatus("confirmed");
    confirmationText.textContent = "Confirmation " + state.confirmationId + " — " +
      humanDate(state.fields.date) + " at " + TIME_LABELS[state.fields.time] +
      " for " + state.fields.full_name + ". A confirmation email will be sent to " + state.fields.email + ".";
    BOOKED_SLOTS[state.fields.date + "|" + state.fields.time] = true;
    announce("Appointment confirmed by you. Confirmation ID " + state.confirmationId + ".");
    confirmedPanel.focus();
  });

  document.getElementById("book-another-btn").addEventListener("click", function () {
    resetForm();
    announce("Ready for a new appointment.");
    if (els.full_name) els.full_name.focus();
  });

  // ---------- Reset ("start over") flow — human-only, two-step confirm ----------
  resetBtn.addEventListener("click", function () {
    resetConfirmRow.hidden = false;
    document.getElementById("reset-confirm-cancel").focus();
  });
  document.getElementById("reset-confirm-yes").addEventListener("click", function () {
    resetForm();
    hideResetConfirm();
    announce("Form cleared. Starting a new appointment.");
    if (els.full_name) els.full_name.focus();
  });
  document.getElementById("reset-confirm-cancel").addEventListener("click", function () {
    hideResetConfirm();
    announce("Reset cancelled.");
    resetBtn.focus();
  });
  resetConfirmRow.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      hideResetConfirm();
      announce("Reset cancelled.");
      resetBtn.focus();
    }
  });

  // ---------- WebMCP tool implementations ----------
  function toolDescribeCurrentState() {
    return { content: [{ type: "text", text: stateSummaryText() }] };
  }

  function toolListAvailableActions() {
    var actions = [];
    if (state.status === "confirmed") {
      actions.push("Nothing further to do — the appointment is already confirmed (ID " + state.confirmationId + ").");
    } else {
      var problems = missingOrInvalidFields();
      if (problems.length) {
        problems.forEach(function (p) {
          actions.push('complete_form_field({ field: "' + p.field + '", value: ... }) — ' + p.error);
        });
      } else if (state.status === "draft") {
        actions.push("confirm_and_submit({}) — all required fields are valid; this stages a review for the human to approve.");
      } else if (state.status === "awaiting_confirmation") {
        actions.push("Waiting on a human to click 'Confirm & book appointment' on screen — no tool can do this step.");
        actions.push("complete_form_field can still be called to change a detail, which will reopen the review.");
      }
      if (!problems.length || problems.length < FIELD_ORDER.length) {
        actions.push("complete_form_field can be called any time to change any field before final human confirmation.");
      }
    }
    return { content: [{ type: "text", text: actions.join("\n") }] };
  }

  function toolCompleteFormField(args) {
    args = args || {};
    var field = args.field;
    var value = args.value;
    if (!field) {
      return { content: [{ type: "text", text: "Missing required argument: field" }], isError: true };
    }
    var result = applyFieldValue(field, value);
    if (!result.ok) {
      return { content: [{ type: "text", text: "Could not set " + field + ": " + result.error }], isError: true };
    }
    announce(fieldLabel(field) + " set to " + JSON.stringify(state.fields[field]) + " by the agent.");
    return { content: [{ type: "text", text: fieldLabel(field) + " set to " + JSON.stringify(state.fields[field]) + "." }] };
  }

  function toolConfirmAndSubmit() {
    if (state.status === "confirmed") {
      return { content: [{ type: "text", text: "Already confirmed. Confirmation ID " + state.confirmationId + ". Nothing to do." }] };
    }
    var problems = missingOrInvalidFields();
    if (problems.length) {
      problems.forEach(function (p) { setFieldError(p.field, p.error); });
      var msg = "Cannot stage for confirmation yet — fix these first: " +
        problems.map(function (p) { return p.label + " (" + p.error + ")"; }).join("; ");
      announce(msg);
      return { content: [{ type: "text", text: msg }], isError: true };
    }
    renderReview();
    setStatus("awaiting_confirmation");
    var msg2 = "All details are valid and a review summary is now visible on the page. " +
      "This tool cannot finalize the booking itself — please ask the human user to read the review and click " +
      "the 'Confirm & book appointment' button themselves. Calling this tool again will not skip that step.";
    announce("Review ready. Waiting for the human to click Confirm & book appointment.");
    return { content: [{ type: "text", text: msg2 }] };
  }

  // ---------- Tool registry (shared by real WebMCP registration and the console) ----------
  var TOOL_DEFS = [
    {
      name: "describe_current_state",
      description: "Report every appointment field's current value, which required fields are still missing or invalid, the booking status, and available options (appointment types, open dates, open times).",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      execute: function () { return toolDescribeCurrentState(); }
    },
    {
      name: "list_available_actions",
      description: "List the concrete next actions available given the current state of the appointment form, e.g. which fields still need values or whether the booking is ready to be staged for human confirmation.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      execute: function () { return toolListAvailableActions(); }
    },
    {
      name: "complete_form_field",
      description: "Fill in a single appointment field. Validates the value (including checking that a chosen date/time slot is actually open) and updates the real form on screen. If the booking was already staged for confirmation, this reopens it for review.",
      inputSchema: {
        type: "object",
        properties: {
          field: { type: "string", enum: FIELD_ORDER, description: "Which field to set." },
          value: { type: "string", description: "The value to set. For appointment_type use one of the enum values from describe_current_state; for date use an ISO date from the available dates list; for time use HH:MM from the open times for the chosen date." }
        },
        required: ["field", "value"],
        additionalProperties: false
      },
      execute: function (args) { return toolCompleteFormField(args); }
    },
    {
      name: "confirm_and_submit",
      description: "Validate that all required fields are complete and stage the appointment as a visible review summary for the human to check. This tool NEVER finalizes the booking itself — finalizing requires an explicit, physical click by the human user on the 'Confirm & book appointment' button, which is not reachable by any tool. Safe to call again; it will not skip human confirmation.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      execute: function () { return toolConfirmAndSubmit(); }
    }
  ];

  // ---------- Action log: every tool call, from any source, timestamped ----------
  function logTimestamp() {
    var d = new Date();
    var hh = String(d.getHours()).padStart(2, "0");
    var mm = String(d.getMinutes()).padStart(2, "0");
    var ss = String(d.getSeconds()).padStart(2, "0");
    return hh + ":" + mm + ":" + ss;
  }

  function logAction(name, args, result) {
    var emptyLi = document.getElementById("action-log-empty");
    if (emptyLi) emptyLi.remove();

    var isError = !!(result && result.isError);
    var text = (result && result.content && result.content[0] && result.content[0].text) || "";

    var li = document.createElement("li");
    li.className = "action-log-entry " + (isError ? "error" : "result");

    var time = document.createElement("span");
    time.className = "action-log-time";
    time.textContent = logTimestamp();

    var call = document.createElement("div");
    call.className = "action-log-call";
    call.textContent = name + "(" + JSON.stringify(args) + ")";

    var out = document.createElement("div");
    out.className = "action-log-result";
    out.textContent = (isError ? "✗ " : "✓ ") + text;

    li.appendChild(time);
    li.appendChild(call);
    li.appendChild(out);
    actionLog.appendChild(li);
    actionLog.scrollTop = actionLog.scrollHeight;
  }

  function clearActionLog() {
    actionLog.innerHTML = "";
    var li = document.createElement("li");
    li.id = "action-log-empty";
    li.className = "action-log-empty";
    li.textContent = "No tool calls yet.";
    actionLog.appendChild(li);
  }

  // Wraps a tool's raw execute function so every call — whether it comes
  // from a real agent via document.modelContext, the manual test console,
  // or the "Review my appointment" button aliasing confirm_and_submit — is
  // logged identically and never throws past this boundary.
  function instrumentedExecute(def) {
    return function (args) {
      var argsForLog = (args === undefined || args === null) ? {} : args;
      var result;
      try {
        result = def.execute(argsForLog);
      } catch (e) {
        result = { content: [{ type: "text", text: "Tool \"" + def.name + "\" threw an unexpected error: " + e.message }], isError: true };
      }
      logAction(def.name, argsForLog, result);
      return result;
    };
  }

  var TOOLS_BY_NAME = {};
  TOOL_DEFS.forEach(function (def) {
    def.run = instrumentedExecute(def);
    TOOLS_BY_NAME[def.name] = def;
  });
  function runTool(name, args) {
    return TOOLS_BY_NAME[name].run(args);
  }

  // ---------- Register with the real WebMCP API when available ----------
  var banner = document.getElementById("webmcp-banner");
  var mcpTarget = null;
  if (typeof document !== "undefined" && "modelContext" in document) {
    mcpTarget = document.modelContext;
  } else if (typeof navigator !== "undefined" && "modelContext" in navigator) {
    mcpTarget = navigator.modelContext;
  }

  if (mcpTarget && typeof mcpTarget.registerTool === "function") {
    TOOL_DEFS.forEach(function (def) {
      try {
        mcpTarget.registerTool({
          name: def.name,
          description: def.description,
          inputSchema: def.inputSchema,
          execute: def.run
        });
      } catch (e) {
        console.error("Failed to register WebMCP tool", def.name, e);
      }
    });
    banner.className = "supported";
    banner.textContent = "✅ WebMCP detected in this browser — all four tools are registered with document.modelContext and an AI agent can call them directly.";
  } else {
    banner.className = "unsupported";
    banner.textContent = "ℹ️ This browser doesn't expose document.modelContext / navigator.modelContext yet (WebMCP is still an early proposal, behind a flag in some browsers). The exact same tool functions are still fully working below — use the Tool Call Console to drive them.";
  }

  // ---------- Tool call console (calls the SAME functions as real registration) ----------
  var consoleToolSelect = document.getElementById("console-tool");
  var consoleArgs = document.getElementById("console-args");
  var consoleJsonError = document.getElementById("console-json-error");

  var EXAMPLE_ARGS = {
    describe_current_state: {},
    list_available_actions: {},
    complete_form_field: { field: "full_name", value: "Jordan Rivera" },
    confirm_and_submit: {}
  };

  TOOL_DEFS.forEach(function (def) {
    var opt = document.createElement("option");
    opt.value = def.name; opt.textContent = def.name;
    consoleToolSelect.appendChild(opt);
  });
  function loadExample() {
    var name = consoleToolSelect.value;
    consoleArgs.value = JSON.stringify(EXAMPLE_ARGS[name] || {}, null, 2);
  }
  consoleToolSelect.addEventListener("change", loadExample);
  loadExample();

  document.getElementById("console-run").addEventListener("click", function () {
    var name = consoleToolSelect.value;
    var args;
    try {
      args = consoleArgs.value.trim() ? JSON.parse(consoleArgs.value) : {};
      consoleJsonError.textContent = "";
    } catch (e) {
      // Not a real tool invocation (no valid arguments to call with), so
      // this deliberately does NOT go into the Action log below.
      consoleJsonError.textContent = "Invalid JSON arguments: " + e.message;
      return;
    }
    runTool(name, args);
  });

  document.getElementById("console-clear").addEventListener("click", function () {
    clearActionLog();
  });

  // ---------- Simple / cognitive-load mode wiring ----------
  function applySimpleHints() {
    var nodes = document.querySelectorAll("[data-simple-text]");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!el.dataset.defaultText) el.dataset.defaultText = el.textContent;
      el.textContent = simpleMode ? el.dataset.simpleText : el.dataset.defaultText;
    }
  }

  function refreshDisplayedErrors() {
    // Re-render any currently-visible field errors so the simple-mode
    // language trim (or its reversal) applies immediately, not just to the
    // next validation run. Goes through setFieldError (not a direct
    // textContent write) so aria-invalid and the "filled" checkmark stay in
    // sync — a rejected value is never stored in state.fields, so this can
    // also legitimately clear a stale error for a value that was attempted
    // but never actually took effect.
    FIELD_ORDER.forEach(function (f) {
      var errEl = document.getElementById(f + "-error");
      if (!errEl || !errEl.textContent) return;
      var msg = validateField(f, state.fields[f]);
      setFieldError(f, msg);
    });
  }

  function applyModeUI(on) {
    document.body.classList.toggle("simple-mode", on);
    simpleModeToggle.setAttribute("aria-pressed", on ? "true" : "false");
    simpleModeToggle.innerHTML = "";
    var icon = document.createElement("span");
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = on ? "✅" : "🔎";
    simpleModeToggle.appendChild(icon);
    simpleModeToggle.appendChild(document.createTextNode(" Simple mode: " + (on ? "On" : "Off")));
    if (toolsPanel) toolsPanel.hidden = on;
    applySimpleHints();
    refreshDisplayedErrors();
  }

  simpleModeToggle.addEventListener("click", function () {
    simpleMode = !simpleMode;
    applyModeUI(simpleMode);
    try {
      localStorage.setItem(SIMPLE_MODE_KEY, simpleMode ? "1" : "0");
    } catch (e) {
      // Ignore storage failures — the toggle still works for this page view.
    }
    announce(simpleMode ? "Simple mode turned on. Larger text, plainer wording, and the developer tool panel is hidden." : "Simple mode turned off.");
  });

  applyModeUI(simpleMode); // apply any persisted preference silently, no announce

  // ---------- Voice input: speak a field's value instead of typing ----------
  // Every recognized value is routed through applyFieldValue() — the exact
  // same function complete_form_field (the tool) and typing (manual input)
  // both call. There is no separate, less-validated path for voice: a
  // spoken value is validated identically to a typed one.
  //
  // VERIFICATION NOTE (implemented-to-spec, not hardware-verified): the
  // transcript-matching/normalization logic in js/voice.js is covered by
  // an automated Node test suite (tests/voice.test.js) using canned
  // transcript strings. The SpeechRecognition capture below — actually
  // listening to a real microphone and getting a transcript back from the
  // browser's speech engine — is implemented to the Web Speech API spec
  // and was exercised here only via feature-detection and by simulating
  // recognition results programmatically; it has NOT been tested with a
  // real microphone/speaker or any assistive/switch-access hardware. See
  // README.md's "Voice mapping" section for the full disclosure.
  var SpeechRecognitionCtor = (typeof window !== "undefined") && (window.SpeechRecognition || window.webkitSpeechRecognition);
  var voiceSupported = !!SpeechRecognitionCtor;
  var activeRecognition = null;
  var voiceSupportNote = document.getElementById("voice-support-note");

  if (voiceSupportNote) {
    var supportedText = "🎤 Voice input available — click the microphone icon next to a field to speak its value.";
    var unsupportedText = "🎤 Voice input isn't available in this browser (needs SpeechRecognition support, e.g. Chrome or Edge).";
    voiceSupportNote.dataset.defaultText = voiceSupported ? supportedText : unsupportedText;
    voiceSupportNote.textContent = simpleMode ? voiceSupportNote.dataset.simpleText : voiceSupportNote.dataset.defaultText;
  }

  // Builds the {value,label} option list a spoken value for `field` should
  // be matched against. Returns null for free-text fields (full_name,
  // email, phone, notes), which take the transcript directly instead.
  function optionsForField(field) {
    if (field === "appointment_type") return APPOINTMENT_TYPES;
    if (field === "date") return AVAILABLE_DATES.map(function (iso) { return { value: iso, label: humanDate(iso) }; });
    if (field === "time") return openTimesFor(state.fields.date, BOOKED_SLOTS).map(function (t) { return { value: t, label: TIME_LABELS[t] }; });
    return null;
  }

  function setVoiceButtonListening(field, listening) {
    FIELD_ORDER.forEach(function (f) {
      var btn = document.getElementById(f + "-voice-btn");
      if (!btn) return;
      if (f === field) {
        btn.classList.toggle("listening", listening);
        btn.setAttribute("aria-pressed", listening ? "true" : "false");
        btn.title = listening ? "Listening… click to stop" : "Speak this field's value";
      } else {
        btn.disabled = listening; // only one recognition session at a time
      }
    });
  }

  function handleVoiceResult(field, transcript) {
    var label = fieldLabel(field);

    // Note: optionsForField("time") deliberately still returns every time
    // slot (via openTimesFor with an empty date) when no date is chosen
    // yet, rather than an empty list — so a spoken time like "9:00 AM"
    // still matches to "09:00" here, and applyFieldValue's own validation
    // naturally surfaces "Choose a date before a time." No special-casing
    // needed; letting the real validation message do its job (rather than
    // trying to pre-empt it with a "didn't understand" message) turned out
    // to be the more correct behavior — confirmed by testing this exact
    // scenario live, where an earlier special-cased version produced a
    // more confusing message than this simpler code does.
    var opts = optionsForField(field);
    if (opts) {
      var matched = Voice.matchSpokenOption(opts, transcript);
      if (matched === null) {
        var article = /^[aeiou]/i.test(label) ? "an" : "a";
        announce("Didn't recognize \"" + transcript + "\" as " + article + " " + label.toLowerCase() + ". Try saying it as shown in the dropdown, or select it manually.");
        return;
      }
      var result = applyFieldValue(field, matched);
      announce(result.ok ? "Heard \"" + transcript + "\" — set " + label + "." : label + ": " + result.error);
      return;
    }

    var value = field === "email" ? Voice.normalizeSpokenEmail(transcript) : String(transcript).trim();
    var result2 = applyFieldValue(field, value);
    announce(result2.ok ? "Heard \"" + transcript + "\" for " + label + "." : label + ": " + result2.error);
  }

  function startVoiceInput(field) {
    if (!voiceSupported) return;
    if (activeRecognition) {
      activeRecognition.abort(); // clicking the active mic button again cancels
      return;
    }

    var recognition = new SpeechRecognitionCtor();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    activeRecognition = recognition;
    setVoiceButtonListening(field, true);
    announce("Listening for " + fieldLabel(field) + "…");

    recognition.onresult = function (event) {
      var transcript = event.results[0][0].transcript;
      handleVoiceResult(field, transcript);
    };
    recognition.onerror = function (event) {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        announce("Microphone access was denied, so voice input can't be used.");
      } else if (event.error === "no-speech") {
        announce("Didn't hear anything for " + fieldLabel(field) + ". Try again.");
      } else if (event.error !== "aborted") {
        announce("Voice input error (" + event.error + "). Try again or type the value instead.");
      }
    };
    recognition.onend = function () {
      setVoiceButtonListening(field, false);
      activeRecognition = null;
    };

    try {
      recognition.start();
    } catch (e) {
      announce("Couldn't start voice input: " + e.message);
      setVoiceButtonListening(field, false);
      activeRecognition = null;
    }
  }

  FIELD_ORDER.forEach(function (field) {
    var btn = document.getElementById(field + "-voice-btn");
    if (!btn) return;
    if (!voiceSupported) {
      btn.disabled = true;
      btn.title = "Voice input isn't supported in this browser.";
      return;
    }
    btn.addEventListener("click", function () { startVoiceInput(field); });
  });

  // ---------- Switch-access: scan mode ----------
  // Implements the standard single-switch auto-scan pattern: keyboard focus
  // advances automatically through every currently reachable control at a
  // fixed, adjustable interval. Activating whatever is focused relies
  // entirely on native browser semantics (Enter/Space activates a focused
  // button; typing works normally in a focused text field) — there is no
  // separate "select" action to build, which mirrors how real switch-access
  // software integrates with ordinary web content (it sends a synthetic
  // keypress to whatever the OS/browser currently has focused). Scanning
  // self-pauses whenever focus lands in a free-text field, since a user
  // needs unlimited time to type once they've scanned their way there.
  //
  // VERIFICATION NOTE (implemented-to-spec, not hardware-verified): every
  // behavior described above (focus order, wraparound, pause-on-text-entry,
  // Escape-to-stop, interval changes) was exercised here by simulating
  // keyboard/focus events programmatically in a real browser session — see
  // TESTING.md. This has NOT been tested with a real switch-access device
  // (a physical switch, sip-and-puff controller, eye-tracker acting as a
  // switch, etc.); only the on-page scanning mechanics are verified.
  var scanModeToggle = document.getElementById("scan-mode-toggle");
  var scanIntervalSelect = document.getElementById("scan-interval");
  var scanIntervalId = null;
  var scanModeOn = false;

  var SCAN_SELECTOR = 'a[href], button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

  function isElementVisible(el) {
    return !!(el.offsetWidth || el.offsetHeight || (el.getClientRects && el.getClientRects().length)) && el.offsetParent !== null;
  }

  function scannableElements() {
    return Array.prototype.filter.call(document.querySelectorAll(SCAN_SELECTOR), isElementVisible);
  }

  function isTextEntryElement(el) {
    if (!el) return false;
    if (el.tagName === "TEXTAREA") return true;
    if (el.tagName === "INPUT") return ["text", "email", "tel"].indexOf(el.type) !== -1;
    return false;
  }

  function scanTick() {
    if (isTextEntryElement(document.activeElement)) return; // let the user keep typing
    var list = scannableElements();
    if (!list.length) return;
    var currentIndex = list.indexOf(document.activeElement);
    var nextIndex = (currentIndex + 1) % list.length;
    list[nextIndex].focus();
  }

  function stopScanningTimer() {
    if (scanIntervalId) {
      clearInterval(scanIntervalId);
      scanIntervalId = null;
    }
  }

  function startScanningTimer() {
    stopScanningTimer();
    var ms = Number(scanIntervalSelect.value) || 1500;
    scanIntervalId = setInterval(scanTick, ms);
  }

  function setScanMode(on) {
    scanModeOn = on;
    scanModeToggle.setAttribute("aria-pressed", on ? "true" : "false");
    scanModeToggle.innerHTML = "";
    var icon = document.createElement("span");
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = on ? "⏹️" : "🔁";
    scanModeToggle.appendChild(icon);
    scanModeToggle.appendChild(document.createTextNode(" Scan mode: " + (on ? "On" : "Off")));

    if (on) {
      startScanningTimer();
      var seconds = Number(scanIntervalSelect.value) / 1000;
      var unit = seconds === 1 ? "second" : "seconds";
      announce("Scan mode on. Focus will move automatically every " + seconds + " " + unit + ". Press Escape or the button again to stop.");
    } else {
      stopScanningTimer();
      announce("Scan mode off.");
    }
  }

  scanModeToggle.addEventListener("click", function () {
    setScanMode(!scanModeOn);
  });
  scanIntervalSelect.addEventListener("change", function () {
    if (scanModeOn) startScanningTimer(); // apply the new speed immediately
  });
  document.addEventListener("keydown", function (e) {
    if (scanModeOn && e.key === "Escape") {
      setScanMode(false);
    }
  });

  // Initial announce
  announce("Page ready. " + FIELD_ORDER.length + " fields to complete, " + REQUIRED_FIELDS.length + " required.");
})();
