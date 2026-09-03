/**
 * Static demo data and date helpers for Riverside Family Clinic.
 * Pure module: no DOM access, so it loads identically in the browser
 * (as a global `ClinicData`) and in Node under `node:test` (via module.exports).
 */
(function (global) {
  "use strict";

  var APPOINTMENT_TYPES = [
    { value: "general_checkup", label: "General Checkup" },
    { value: "dental_cleaning", label: "Dental Cleaning" },
    { value: "physical_therapy", label: "Physical Therapy" },
    { value: "vaccination", label: "Vaccination" },
    { value: "follow_up", label: "Follow-up Consultation" },
    { value: "specialist_consult", label: "Specialist Consultation" },
    { value: "telehealth", label: "Telehealth Visit" },
    { value: "lab_work", label: "Lab Work / Blood Draw" },
    { value: "mental_health", label: "Mental Health Session" }
  ];

  var TIME_SLOTS = ["09:00", "10:30", "13:00", "14:30", "16:00"];
  var TIME_LABELS = {
    "09:00": "9:00 AM",
    "10:30": "10:30 AM",
    "13:00": "1:00 PM",
    "14:30": "2:30 PM",
    "16:00": "4:00 PM"
  };

  function nextWeekdays(count, startOffsetDays, fromDate) {
    var dates = [];
    var d = fromDate ? new Date(fromDate) : new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + startOffsetDays);
    while (dates.length < count) {
      var day = d.getDay();
      if (day !== 0 && day !== 6) {
        dates.push(new Date(d));
      }
      d.setDate(d.getDate() + 1);
    }
    return dates;
  }

  function isoDate(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function humanDate(iso) {
    var d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  }

  function buildAvailableDates(fromDate) {
    return nextWeekdays(6, 1, fromDate).map(isoDate);
  }

  // Seed a couple of "already booked by another patient" slots relative to
  // whatever the current available-dates window is, so the agent has to
  // genuinely handle an unavailable-slot case, not just the happy path.
  function seedBookedSlots(availableDates) {
    var booked = {};
    if (availableDates[1]) booked[availableDates[1] + "|10:30"] = true;
    if (availableDates[3]) booked[availableDates[3] + "|13:00"] = true;
    return booked;
  }

  function openTimesFor(dateIso, bookedSlots) {
    return TIME_SLOTS.filter(function (t) { return !bookedSlots[dateIso + "|" + t]; });
  }

  var api = {
    APPOINTMENT_TYPES: APPOINTMENT_TYPES,
    TIME_SLOTS: TIME_SLOTS,
    TIME_LABELS: TIME_LABELS,
    nextWeekdays: nextWeekdays,
    isoDate: isoDate,
    humanDate: humanDate,
    buildAvailableDates: buildAvailableDates,
    seedBookedSlots: seedBookedSlots,
    openTimesFor: openTimesFor
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    global.ClinicData = api;
  }
})(typeof window !== "undefined" ? window : this);
