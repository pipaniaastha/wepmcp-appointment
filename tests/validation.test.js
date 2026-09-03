"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var ClinicData = require("../js/data.js");
var Validation = require("../js/validation.js");

// Fix "today" so the test suite is deterministic regardless of when it runs.
var FIXED_TODAY = new Date("2026-09-01T00:00:00"); // a Tuesday
var AVAILABLE_DATES = ClinicData.buildAvailableDates(FIXED_TODAY);
var BOOKED_SLOTS = ClinicData.seedBookedSlots(AVAILABLE_DATES);

function ctx(overrides) {
  return Object.assign(
    {
      appointmentTypes: ClinicData.APPOINTMENT_TYPES,
      availableDates: AVAILABLE_DATES,
      timeSlots: ClinicData.TIME_SLOTS,
      bookedSlots: BOOKED_SLOTS,
      selectedDate: null
    },
    overrides || {}
  );
}

// ---------- full_name ----------
test("full_name: rejects empty", function () {
  assert.match(Validation.validateField("full_name", "", ctx()), /required/i);
});
test("full_name: rejects too short", function () {
  assert.match(Validation.validateField("full_name", "A", ctx()), /too short/i);
});
test("full_name: rejects too long", function () {
  var longName = "A".repeat(81);
  assert.match(Validation.validateField("full_name", longName, ctx()), /too long/i);
});
test("full_name: rejects digits/symbols", function () {
  assert.match(Validation.validateField("full_name", "Jordan123", ctx()), /letters, spaces/i);
});
test("full_name: accepts hyphens and apostrophes", function () {
  assert.equal(Validation.validateField("full_name", "Mary-Jane O'Neil", ctx()), null);
});
test("full_name: trims surrounding whitespace before validating", function () {
  assert.equal(Validation.validateField("full_name", "   Jordan Rivera   ", ctx()), null);
});

// ---------- email ----------
test("email: rejects empty", function () {
  assert.match(Validation.validateField("email", "", ctx()), /required/i);
});
test("email: rejects missing @", function () {
  assert.match(Validation.validateField("email", "not-an-email.com", ctx()), /valid email/i);
});
test("email: rejects missing domain dot", function () {
  assert.match(Validation.validateField("email", "person@example", ctx()), /valid email/i);
});
test("email: accepts a normal address", function () {
  assert.equal(Validation.validateField("email", "jordan@example.com", ctx()), null);
});

// ---------- phone (optional) ----------
test("phone: empty is valid (optional field)", function () {
  assert.equal(Validation.validateField("phone", "", ctx()), null);
});
test("phone: rejects fewer than 7 digits", function () {
  assert.match(Validation.validateField("phone", "12345", ctx()), /at least 7 digits/i);
});
test("phone: rejects letters", function () {
  assert.match(Validation.validateField("phone", "555-CALL-NOW", ctx()), /digits and the usual punctuation/i);
});
test("phone: accepts a formatted US number", function () {
  assert.equal(Validation.validateField("phone", "(555) 123-4567", ctx()), null);
});

// ---------- appointment_type ----------
test("appointment_type: rejects empty", function () {
  assert.match(Validation.validateField("appointment_type", "", ctx()), /choose an appointment type/i);
});
test("appointment_type: rejects unknown value", function () {
  assert.match(Validation.validateField("appointment_type", "brain_surgery", ctx()), /isn't a recognized/i);
});
test("appointment_type: accepts every value in the demo list", function () {
  ClinicData.APPOINTMENT_TYPES.forEach(function (t) {
    assert.equal(Validation.validateField("appointment_type", t.value, ctx()), null);
  });
});

// ---------- date ----------
test("date: rejects empty", function () {
  assert.match(Validation.validateField("date", "", ctx()), /choose a date/i);
});
test("date: rejects a date not in the available list (e.g. a weekend)", function () {
  assert.match(Validation.validateField("date", "2026-09-06", ctx()), /isn't open for booking/i); // a Sunday
});
test("date: accepts a date from the available list", function () {
  assert.equal(Validation.validateField("date", AVAILABLE_DATES[0], ctx()), null);
});

// ---------- time ----------
test("time: rejects empty", function () {
  assert.match(Validation.validateField("time", "", ctx({ selectedDate: AVAILABLE_DATES[0] })), /choose a time/i);
});
test("time: rejects a value that isn't a clinic slot", function () {
  assert.match(
    Validation.validateField("time", "23:59", ctx({ selectedDate: AVAILABLE_DATES[0] })),
    /isn't a clinic time slot/i
  );
});
test("time: requires a date to be selected first", function () {
  assert.match(Validation.validateField("time", "09:00", ctx({ selectedDate: null })), /choose a date before a time/i);
});
test("time: rejects an already-booked slot", function () {
  var bookedDate = AVAILABLE_DATES[1];
  assert.match(
    Validation.validateField("time", "10:30", ctx({ selectedDate: bookedDate })),
    /already booked/i
  );
});
test("time: accepts an open slot on a valid date", function () {
  var openDate = AVAILABLE_DATES[0];
  var open = ClinicData.openTimesFor(openDate, BOOKED_SLOTS);
  assert.ok(open.length > 0, "test fixture expects at least one open slot");
  assert.equal(Validation.validateField("time", open[0], ctx({ selectedDate: openDate })), null);
});

// ---------- notes (optional) ----------
test("notes: empty is valid", function () {
  assert.equal(Validation.validateField("notes", "", ctx()), null);
});
test("notes: accepts up to 300 characters", function () {
  assert.equal(Validation.validateField("notes", "x".repeat(300), ctx()), null);
});
test("notes: rejects more than 300 characters", function () {
  assert.match(Validation.validateField("notes", "x".repeat(301), ctx()), /300 characters or fewer/i);
});

// ---------- unknown field ----------
test("unknown field name returns a descriptive error", function () {
  assert.match(Validation.validateField("favorite_color", "blue", ctx()), /unknown field/i);
});

// ---------- missingOrInvalidFields ----------
test("missingOrInvalidFields: flags all required fields on a blank form", function () {
  var blank = { full_name: "", email: "", phone: "", appointment_type: "", date: "", time: "", notes: "" };
  var problems = Validation.missingOrInvalidFields(blank, ctx());
  var flagged = problems.map(function (p) { return p.field; });
  assert.deepEqual(flagged.sort(), Validation.REQUIRED_FIELDS.slice().sort());
});
test("missingOrInvalidFields: empty when every required field is valid", function () {
  var openDate = AVAILABLE_DATES[0];
  var open = ClinicData.openTimesFor(openDate, BOOKED_SLOTS)[0];
  var filled = {
    full_name: "Jordan Rivera",
    email: "jordan@example.com",
    phone: "",
    appointment_type: ClinicData.APPOINTMENT_TYPES[0].value,
    date: openDate,
    time: open,
    notes: ""
  };
  var problems = Validation.missingOrInvalidFields(filled, ctx({ selectedDate: openDate }));
  assert.deepEqual(problems, []);
});
test("missingOrInvalidFields: does not flag optional fields (phone, notes)", function () {
  var openDate = AVAILABLE_DATES[0];
  var open = ClinicData.openTimesFor(openDate, BOOKED_SLOTS)[0];
  var filled = {
    full_name: "Jordan Rivera",
    email: "jordan@example.com",
    phone: "not-a-real-phone!!", // invalid, but optional fields aren't in REQUIRED_FIELDS
    appointment_type: ClinicData.APPOINTMENT_TYPES[0].value,
    date: openDate,
    time: open,
    notes: ""
  };
  var problems = Validation.missingOrInvalidFields(filled, ctx({ selectedDate: openDate }));
  assert.deepEqual(problems, []);
});

// ---------- data helpers ----------
test("buildAvailableDates: only returns weekdays", function () {
  AVAILABLE_DATES.forEach(function (iso) {
    var day = new Date(iso + "T00:00:00").getDay();
    assert.notEqual(day, 0, iso + " should not be a Sunday");
    assert.notEqual(day, 6, iso + " should not be a Saturday");
  });
});
test("buildAvailableDates: returns 6 dates starting after the given day", function () {
  assert.equal(AVAILABLE_DATES.length, 6);
  AVAILABLE_DATES.forEach(function (iso) {
    assert.ok(new Date(iso + "T00:00:00") > FIXED_TODAY);
  });
});
test("openTimesFor: excludes seeded booked slots", function () {
  var bookedDate = AVAILABLE_DATES[1];
  var open = ClinicData.openTimesFor(bookedDate, BOOKED_SLOTS);
  assert.ok(open.indexOf("10:30") === -1);
});
test("openTimesFor: returns all slots for a date with no bookings", function () {
  var cleanDate = AVAILABLE_DATES[0];
  var open = ClinicData.openTimesFor(cleanDate, BOOKED_SLOTS);
  assert.deepEqual(open, ClinicData.TIME_SLOTS);
});
