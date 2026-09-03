"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var Voice = require("../js/voice.js");

// ---------- normalizeSpokenEmail ----------
test("normalizeSpokenEmail: converts spoken 'at' and 'dot'", function () {
  assert.equal(Voice.normalizeSpokenEmail("jordan at example dot com"), "jordan@example.com");
});
test("normalizeSpokenEmail: lowercases and trims", function () {
  assert.equal(Voice.normalizeSpokenEmail("  Jordan AT Example DOT Com  "), "jordan@example.com");
});
test("normalizeSpokenEmail: handles multiple dots", function () {
  assert.equal(Voice.normalizeSpokenEmail("jordan dot rivera at example dot co dot uk"), "jordan.rivera@example.co.uk");
});
test("normalizeSpokenEmail: passthrough for already-typed email with no spoken words", function () {
  assert.equal(Voice.normalizeSpokenEmail("jordan@example.com"), "jordan@example.com");
});
test("normalizeSpokenEmail: empty/undefined input passes through", function () {
  assert.equal(Voice.normalizeSpokenEmail(""), "");
  assert.equal(Voice.normalizeSpokenEmail(undefined), undefined);
});

// ---------- matchSpokenOption ----------
var APPOINTMENT_TYPES = [
  { value: "general_checkup", label: "General Checkup" },
  { value: "dental_cleaning", label: "Dental Cleaning" },
  { value: "physical_therapy", label: "Physical Therapy" },
  { value: "vaccination", label: "Vaccination" },
  { value: "follow_up", label: "Follow-up Consultation" }
];

test("matchSpokenOption: exact label match (case-insensitive)", function () {
  assert.equal(Voice.matchSpokenOption(APPOINTMENT_TYPES, "dental cleaning"), "dental_cleaning");
  assert.equal(Voice.matchSpokenOption(APPOINTMENT_TYPES, "DENTAL CLEANING"), "dental_cleaning");
});
test("matchSpokenOption: matches the value spoken as words", function () {
  assert.equal(Voice.matchSpokenOption(APPOINTMENT_TYPES, "general checkup"), "general_checkup");
});
test("matchSpokenOption: tolerates trailing punctuation from speech engines", function () {
  assert.equal(Voice.matchSpokenOption(APPOINTMENT_TYPES, "vaccination."), "vaccination");
});
test("matchSpokenOption: partial/substring match when unambiguous", function () {
  assert.equal(Voice.matchSpokenOption(APPOINTMENT_TYPES, "vaccination please"), "vaccination");
});
test("matchSpokenOption: returns null for no match", function () {
  assert.equal(Voice.matchSpokenOption(APPOINTMENT_TYPES, "brain surgery"), null);
});
test("matchSpokenOption: returns null for empty transcript", function () {
  assert.equal(Voice.matchSpokenOption(APPOINTMENT_TYPES, ""), null);
});
test("matchSpokenOption: returns null for empty options list", function () {
  assert.equal(Voice.matchSpokenOption([], "dental cleaning"), null);
});
test("matchSpokenOption: ambiguous substring match returns null rather than guessing", function () {
  var ambiguous = [
    { value: "a", label: "Morning Session" },
    { value: "b", label: "Evening Session" }
  ];
  // "session" is a substring of both labels and an exact match for
  // neither, so two options match partially — must not silently pick one.
  assert.equal(Voice.matchSpokenOption(ambiguous, "session"), null);
});

// Real-world-shaped example: matching against date labels the way
// js/app.js builds them (see optionsForField in app.js).
test("matchSpokenOption: matches a humanized date label", function () {
  var dateOptions = [
    { value: "2026-09-07", label: "Monday, September 7, 2026" },
    { value: "2026-09-08", label: "Tuesday, September 8, 2026" }
  ];
  assert.equal(Voice.matchSpokenOption(dateOptions, "Monday, September 7, 2026"), "2026-09-07");
  assert.equal(Voice.matchSpokenOption(dateOptions, "monday september 7 2026"), null); // punctuation-sensitive substring match is intentionally conservative
});

// Real-world-shaped example: matching against time labels.
test("matchSpokenOption: matches a time label", function () {
  var timeOptions = [
    { value: "09:00", label: "9:00 AM" },
    { value: "13:00", label: "1:00 PM" }
  ];
  assert.equal(Voice.matchSpokenOption(timeOptions, "9:00 AM"), "09:00");
  assert.equal(Voice.matchSpokenOption(timeOptions, "1:00 pm"), "13:00");
});
