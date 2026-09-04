"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var Interpret = require("../js/interpret.js");

var VALID_FIELDS = ["appointment_type", "date", "time", "notes"];

var APPOINTMENT_TYPES = [
  { value: "general_checkup", label: "General Checkup" },
  { value: "dental_cleaning", label: "Dental Cleaning" }
];
var DATE_TIME_TABLE = [
  { date: "2026-09-07", label: "Monday, September 7, 2026", openTimes: [{ value: "09:00", label: "9:00 AM" }, { value: "13:00", label: "1:00 PM" }] },
  { date: "2026-09-08", label: "Tuesday, September 8, 2026", openTimes: [{ value: "14:30", label: "2:30 PM" }] },
  { date: "2026-09-09", label: "Wednesday, September 9, 2026", openTimes: [] }
];

// ---------- buildSystemPrompt ----------
test("buildSystemPrompt: lists every appointment type value and label", function () {
  var prompt = Interpret.buildSystemPrompt(APPOINTMENT_TYPES, DATE_TIME_TABLE);
  assert.match(prompt, /general_checkup/);
  assert.match(prompt, /General Checkup/);
  assert.match(prompt, /dental_cleaning/);
});
test("buildSystemPrompt: lists every date and only its OPEN times", function () {
  var prompt = Interpret.buildSystemPrompt(APPOINTMENT_TYPES, DATE_TIME_TABLE);
  assert.match(prompt, /2026-09-07/);
  assert.match(prompt, /09:00/);
  assert.match(prompt, /13:00/);
  assert.match(prompt, /2026-09-08/);
  assert.match(prompt, /14:30/);
});
test("buildSystemPrompt: a date with no open times says so rather than omitting it", function () {
  var prompt = Interpret.buildSystemPrompt(APPOINTMENT_TYPES, DATE_TIME_TABLE);
  assert.match(prompt, /2026-09-09.*no open times/);
});
test("buildSystemPrompt: instructs the model never to invent values", function () {
  var prompt = Interpret.buildSystemPrompt(APPOINTMENT_TYPES, DATE_TIME_TABLE);
  assert.match(prompt, /NEVER invent/);
});
test("buildSystemPrompt: instructs strict JSON-only output shape", function () {
  var prompt = Interpret.buildSystemPrompt(APPOINTMENT_TYPES, DATE_TIME_TABLE);
  assert.match(prompt, /"resolved"/);
  assert.match(prompt, /"unresolved"/);
  assert.match(prompt, /"clarification"/);
});

// ---------- parseInterpretationResponse: valid shapes ----------
test("parseInterpretationResponse: fully resolved response", function () {
  var res = Interpret.parseInterpretationResponse(
    JSON.stringify({ resolved: { appointment_type: "dental_cleaning", date: "2026-09-08", time: "14:30" }, unresolved: [], clarification: "" }),
    VALID_FIELDS
  );
  assert.equal(res.ok, true);
  assert.deepEqual(res.resolved, { appointment_type: "dental_cleaning", date: "2026-09-08", time: "14:30" });
  assert.deepEqual(res.unresolved, []);
  assert.equal(res.clarification, "");
});
test("parseInterpretationResponse: partially resolved with a clarification question", function () {
  var res = Interpret.parseInterpretationResponse(
    JSON.stringify({
      resolved: { appointment_type: "dental_cleaning" },
      unresolved: ["date", "time"],
      clarification: "Which day works best for you — I have Monday or Tuesday open?"
    }),
    VALID_FIELDS
  );
  assert.equal(res.ok, true);
  assert.deepEqual(res.resolved, { appointment_type: "dental_cleaning" });
  assert.deepEqual(res.unresolved, ["date", "time"]);
  assert.match(res.clarification, /Monday or Tuesday/);
});
test("parseInterpretationResponse: nothing resolved, full clarification", function () {
  var res = Interpret.parseInterpretationResponse(
    JSON.stringify({ resolved: {}, unresolved: ["appointment_type", "date", "time"], clarification: "What kind of appointment do you need, and when?" }),
    VALID_FIELDS
  );
  assert.equal(res.ok, true);
  assert.deepEqual(res.resolved, {});
});
test("parseInterpretationResponse: missing optional keys default sensibly", function () {
  var res = Interpret.parseInterpretationResponse(JSON.stringify({ resolved: { notes: "back pain" } }), VALID_FIELDS);
  assert.equal(res.ok, true);
  assert.deepEqual(res.resolved, { notes: "back pain" });
  assert.deepEqual(res.unresolved, []);
  assert.equal(res.clarification, "");
});

// ---------- parseInterpretationResponse: malformed / adversarial ----------
test("parseInterpretationResponse: not valid JSON at all", function () {
  var res = Interpret.parseInterpretationResponse("Sure! I think you want a dental cleaning.", VALID_FIELDS);
  assert.equal(res.ok, false);
  assert.match(res.error, /valid JSON/);
});
test("parseInterpretationResponse: valid JSON but not an object (e.g. a bare array)", function () {
  var res = Interpret.parseInterpretationResponse("[1,2,3]", VALID_FIELDS);
  assert.equal(res.ok, false);
});
test("parseInterpretationResponse: valid JSON but a bare string", function () {
  var res = Interpret.parseInterpretationResponse('"dental_cleaning"', VALID_FIELDS);
  assert.equal(res.ok, false);
});
test("parseInterpretationResponse: resolved is not an object", function () {
  var res = Interpret.parseInterpretationResponse(JSON.stringify({ resolved: "dental_cleaning" }), VALID_FIELDS);
  assert.equal(res.ok, false);
  assert.match(res.error, /"resolved"/);
});
test("parseInterpretationResponse: rejects a field name outside the allowed list (hallucinated/unknown field)", function () {
  var res = Interpret.parseInterpretationResponse(
    JSON.stringify({ resolved: { full_name: "Jordan Rivera", appointment_type: "dental_cleaning" } }),
    VALID_FIELDS
  );
  assert.equal(res.ok, false);
  assert.match(res.error, /full_name/);
});
test("parseInterpretationResponse: rejects a non-string resolved value", function () {
  var res = Interpret.parseInterpretationResponse(JSON.stringify({ resolved: { time: 900 } }), VALID_FIELDS);
  assert.equal(res.ok, false);
});
test("parseInterpretationResponse: rejects an empty-string resolved value rather than treating it as set", function () {
  var res = Interpret.parseInterpretationResponse(JSON.stringify({ resolved: { date: "" } }), VALID_FIELDS);
  assert.equal(res.ok, false);
});
test("parseInterpretationResponse: unresolved must be an array if present", function () {
  var res = Interpret.parseInterpretationResponse(JSON.stringify({ resolved: {}, unresolved: "date, time" }), VALID_FIELDS);
  assert.equal(res.ok, false);
});
test("parseInterpretationResponse: non-string entries in unresolved are silently dropped, not fatal", function () {
  var res = Interpret.parseInterpretationResponse(JSON.stringify({ resolved: {}, unresolved: ["date", 42, null] }), VALID_FIELDS);
  assert.equal(res.ok, true);
  assert.deepEqual(res.unresolved, ["date"]);
});
test("parseInterpretationResponse: clarification must be a string if present", function () {
  var res = Interpret.parseInterpretationResponse(JSON.stringify({ resolved: {}, clarification: 12345 }), VALID_FIELDS);
  assert.equal(res.ok, false);
});
test("parseInterpretationResponse: never throws on completely unexpected shapes", function () {
  var weirdInputs = ["null", "undefined", "{}", "[]", "", "{,}", '{"resolved":null}', '{"resolved":[1,2]}'];
  weirdInputs.forEach(function (input) {
    assert.doesNotThrow(function () {
      Interpret.parseInterpretationResponse(input, VALID_FIELDS);
    }, "should not throw for input: " + input);
  });
});
