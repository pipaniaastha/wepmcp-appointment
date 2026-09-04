/**
 * Pure helpers for the interpret_intent tool: building the prompt sent to
 * the LLM, building the JSON Schema that constrains its response, and
 * validating/parsing whatever JSON it sends back. No network access and no
 * DOM access here on purpose — same pattern as
 * data.js/validation.js/voice.js — so the deterministic half of this
 * feature (everything except the actual model call) is directly
 * unit-testable in Node (tests/interpret.test.js).
 *
 * The actual fetch() to Groq's API lives in js/app.js, since that's the
 * one genuinely impure, unverifiable-without-a-real-key part of this
 * feature. See README.md's "interpret_intent" section for the full
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
      "is not in these lists, leave that field unresolved (null) rather than picking the closest guess.",
      "",
      "Valid appointment_type values (use the value, not the label):",
      typeLines,
      "",
      "Valid date values, and the open time values available on each (times not listed are already",
      "booked or do not exist — never propose one):",
      dateLines,
      "",
      "Your response is constrained to a fixed JSON Schema, so every key below is always present:",
      '{"resolved": {"appointment_type": string|null, "date": string|null, "time": string|null, "notes": string|null},',
      ' "unresolved": string[], "clarification": string}',
      "",
      "Rules:",
      "- Set a \"resolved\" field to its exact value from the lists above only if you are confident.",
      "  Otherwise set it to null — never omit it, never guess.",
      "- If the request mentions a relative time you can resolve unambiguously against the list above",
      "  (e.g. \"soonest\" = the earliest date/time listed; \"Tuesday afternoon\" = a date above that falls",
      "  on a Tuesday, with a time above from the afternoon), resolve it.",
      "- If it's genuinely ambiguous (e.g. two Tuesdays are both listed and nothing disambiguates them,",
      "  or no appointment type is mentioned at all), set that field to null, list its name in",
      "  \"unresolved\", and put a short, specific question in \"clarification\".",
      "- \"notes\" may capture any leftover descriptive detail from the request that isn't itself a",
      "  field value (e.g. \"my back has been hurting\"). Never put an appointment_type/date/time guess in notes.",
      "- If everything is resolved, \"unresolved\" should be [] and \"clarification\" should be \"\"."
    ].join("\n");
  }

  /**
   * Builds the JSON Schema sent as `response_format.json_schema.schema` to
   * constrain the model's output via Groq's strict structured-outputs mode
   * (constrained decoding — the API guarantees the response matches this
   * shape). Strict mode requires every property to be listed in "required",
   * so optional fields are modeled as nullable (string|null) rather than
   * omittable, which is why parseInterpretationResponse below treats a
   * null value the same as "not resolved."
   *
   * @param {string[]} validFieldNames - field names interpret_intent may set
   * @returns {object} a JSON Schema object
   */
  function buildResponseSchema(validFieldNames) {
    var resolvedProperties = {};
    validFieldNames.forEach(function (name) {
      resolvedProperties[name] = { type: ["string", "null"] };
    });
    return {
      type: "object",
      properties: {
        resolved: {
          type: "object",
          properties: resolvedProperties,
          required: validFieldNames.slice(),
          additionalProperties: false
        },
        unresolved: { type: "array", items: { type: "string" } },
        clarification: { type: "string" }
      },
      required: ["resolved", "unresolved", "clarification"],
      additionalProperties: false
    };
  }

  var KNOWN_TOP_LEVEL_KEYS = ["resolved", "unresolved", "clarification"];

  /**
   * Validates and normalizes the model's raw JSON response text. Never
   * throws; always returns a shape-checked result so a malformed or
   * adversarial model response can't corrupt app state. This is
   * deliberately still defensive even though Groq's strict schema mode is
   * supposed to guarantee conformance — that guarantee is Groq's claim, not
   * something this code can verify itself, and defense-in-depth costs
   * nothing here.
   *
   * A field value of `null` (the schema's way of expressing "not resolved,"
   * since strict mode requires every key to be present) is treated
   * identically to an absent/empty value — silently not included in
   * "resolved," not an error.
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
      if (validFieldNames.indexOf(key) === -1) {
        badKeys.push(key);
        return;
      }
      var value = resolvedRaw[key];
      if (value === null || value === "") return; // not resolved — valid, not an error
      if (typeof value !== "string") {
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
    buildResponseSchema: buildResponseSchema,
    parseInterpretationResponse: parseInterpretationResponse,
    KNOWN_TOP_LEVEL_KEYS: KNOWN_TOP_LEVEL_KEYS
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    global.Interpret = api;
  }
})(typeof window !== "undefined" ? window : this);
