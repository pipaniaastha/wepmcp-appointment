/**
 * Pure helpers for the interpret_intent tool: building the prompt sent to
 * the LLM, and validating/parsing whatever JSON it sends back. No network
 * access and no DOM access here on purpose — same pattern as
 * data.js/validation.js/voice.js — so the deterministic half of this
 * feature (everything except the actual model call) is directly
 * unit-testable in Node (tests/interpret.test.js).
 *
 * The actual fetch() to OpenAI's API lives in js/app.js, since that's the
 * one genuinely impure, unverifiable-without-a-real-key part of this
 * feature. See README.md's "AI interpretation" section for the full
 * implemented-to-spec-vs-live-verified disclosure.
 */
(function (global) {
  "use strict";

  /**
   * Builds the system prompt given the clinic's REAL current data, so the
   * model is only ever shown values that actually exist right now — it has
   * no way to "know about" a date, time, or appointment type this page
   * doesn't currently offer.
   *
   * @param {Array<{value:string,label:string}>} appointmentTypes
   * @param {Array<{date:string,label:string,openTimes:Array<{value:string,label:string}>}>} dateTimeTable
   * @returns {string}
   */
  function buildSystemPrompt(appointmentTypes, dateTimeTable) {
    var typeLines = appointmentTypes.map(function (t) {
      return "- " + t.value + " (\"" + t.label + "\")";
    }).join("\n");

    var dateLines = dateTimeTable.map(function (d) {
      var times = d.openTimes.length
        ? d.openTimes.map(function (t) { return t.value + " (\"" + t.label + "\")"; }).join(", ")
        : "no open times";
      return "- " + d.date + " (\"" + d.label + "\"): " + times;
    }).join("\n");

    return [
      "You are interpreting a patient's free-form appointment request for a clinic booking form.",
      "You may resolve ONLY the following fields: appointment_type, date, time, notes.",
      "You must NEVER invent a value that is not explicitly listed below — if the exact right answer",
      "is not in these lists, leave that field unresolved rather than picking the closest guess.",
      "",
      "Valid appointment_type values (use the value, not the label):",
      typeLines,
      "",
      "Valid date values, and the open time values available on each (times not listed are already",
      "booked or do not exist — never propose one):",
      dateLines,
      "",
      "Respond with ONLY a single JSON object, no other text, in exactly this shape:",
      '{"resolved": {"appointment_type"?: string, "date"?: string, "time"?: string, "notes"?: string},',
      ' "unresolved": string[], "clarification": string}',
      "",
      "Rules:",
      "- Only include a field in \"resolved\" if you are confident, and only using the exact values listed above.",
      "- If the request mentions a relative time you can resolve unambiguously against the list above",
      "  (e.g. \"soonest\" = the earliest date/time listed; \"Tuesday afternoon\" = a date above that falls",
      "  on a Tuesday, with a time above from the afternoon), resolve it.",
      "- If it's genuinely ambiguous (e.g. two Tuesdays are both listed and nothing disambiguates them,",
      "  or no appointment type is mentioned at all), leave that field out of \"resolved\", list its name",
      "  in \"unresolved\", and put a short, specific question in \"clarification\".",
      "- \"notes\" may capture any leftover descriptive detail from the request that isn't itself a",
      "  field value (e.g. \"my back has been hurting\"). Never put an appointment_type/date/time guess in notes.",
      "- If everything is resolved, \"unresolved\" should be [] and \"clarification\" should be \"\"."
    ].join("\n");
  }

  var KNOWN_TOP_LEVEL_KEYS = ["resolved", "unresolved", "clarification"];

  /**
   * Validates and normalizes the model's raw JSON response text. Never
   * throws; always returns a shape-checked result so a malformed or
   * adversarial model response can't corrupt app state.
   *
   * @param {string} rawText
   * @param {string[]} validFieldNames - field names this tool is allowed to set
   * @returns {{ok:true, resolved:Object<string,string>, unresolved:string[], clarification:string}
   *          | {ok:false, error:string}}
   */
  function parseInterpretationResponse(rawText, validFieldNames) {
    var parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch (e) {
      return { ok: false, error: "The AI's response wasn't valid JSON (" + e.message + ")." };
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, error: "The AI's response wasn't a JSON object." };
    }

    var resolvedRaw = parsed.resolved;
    if (resolvedRaw === undefined || resolvedRaw === null) resolvedRaw = {};
    if (typeof resolvedRaw !== "object" || Array.isArray(resolvedRaw)) {
      return { ok: false, error: "The AI's \"resolved\" field wasn't an object." };
    }

    var resolved = {};
    var badKeys = [];
    Object.keys(resolvedRaw).forEach(function (key) {
      var value = resolvedRaw[key];
      if (validFieldNames.indexOf(key) === -1 || typeof value !== "string" || !value.trim()) {
        badKeys.push(key);
        return;
      }
      resolved[key] = value;
    });
    if (badKeys.length) {
      return { ok: false, error: "The AI proposed unusable field(s): " + badKeys.join(", ") + "." };
    }

    var unresolvedRaw = parsed.unresolved;
    if (unresolvedRaw !== undefined && !Array.isArray(unresolvedRaw)) {
      return { ok: false, error: "The AI's \"unresolved\" field wasn't a list." };
    }
    var unresolved = (unresolvedRaw || []).filter(function (x) { return typeof x === "string" && x; });

    var clarification = parsed.clarification;
    if (clarification !== undefined && typeof clarification !== "string") {
      return { ok: false, error: "The AI's \"clarification\" field wasn't text." };
    }

    return { ok: true, resolved: resolved, unresolved: unresolved, clarification: clarification || "" };
  }

  var api = {
    buildSystemPrompt: buildSystemPrompt,
    parseInterpretationResponse: parseInterpretationResponse,
    KNOWN_TOP_LEVEL_KEYS: KNOWN_TOP_LEVEL_KEYS
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    global.Interpret = api;
  }
})(typeof window !== "undefined" ? window : this);
