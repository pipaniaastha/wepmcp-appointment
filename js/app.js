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
  function setFieldError(field, message) {
    var errEl = document.getElementById(field + "-error");
    var input = els[field];
    var wrap = document.getElementById("field-" + field);
    if (errEl) errEl.textContent = message || "";
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
      ["Name", state.fields.full_name],
      ["Email", state.fields.email],
      ["Phone", state.fields.phone || "(not provided)"],
      ["Appointment type", (APPOINTMENT_TYPES.filter(function (t) { return t.value === state.fields.appointment_type; })[0] || {}).label || state.fields.appointment_type],
      ["Date", humanDate(state.fields.date)],
      ["Time", TIME_LABELS[state.fields.time] || state.fields.time],
      ["Notes", state.fields.notes || "(none)"]
    ];
    rows.forEach(function (r) {
      var dt = document.createElement("dt"); dt.textContent = r[0];
      var dd = document.createElement("dd"); dd.textContent = r[1];
      reviewFields.appendChild(dt); reviewFields.appendChild(dd);
    });
  }

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
    var res = toolConfirmAndSubmit();
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
          execute: def.execute
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
  var consoleLog = document.getElementById("console-log");

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

  function logLine(cls, text) {
    var div = document.createElement("div");
    div.className = cls;
    div.textContent = text;
    consoleLog.appendChild(div);
    consoleLog.scrollTop = consoleLog.scrollHeight;
  }

  document.getElementById("console-run").addEventListener("click", function () {
    var name = consoleToolSelect.value;
    var def = TOOL_DEFS.filter(function (d) { return d.name === name; })[0];
    var args;
    try {
      args = consoleArgs.value.trim() ? JSON.parse(consoleArgs.value) : {};
    } catch (e) {
      logLine("error", "Invalid JSON arguments: " + e.message);
      return;
    }
    logLine("call", "→ " + name + "(" + JSON.stringify(args) + ")");
    var result;
    try {
      result = def.execute(args);
    } catch (e) {
      logLine("error", "✗ threw: " + e.message);
      return;
    }
    var text = (result && result.content && result.content[0] && result.content[0].text) || JSON.stringify(result);
    logLine(result && result.isError ? "error" : "result", (result && result.isError ? "✗ " : "✓ ") + text);
  });

  document.getElementById("console-clear").addEventListener("click", function () {
    consoleLog.innerHTML = "";
  });

  // Initial announce
  announce("Page ready. " + FIELD_ORDER.length + " fields to complete, " + REQUIRED_FIELDS.length + " required.");
})();
