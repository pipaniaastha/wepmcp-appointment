/**
 * Pure field-validation logic for the appointment form.
 * No DOM access here on purpose: every function takes plain data in and
 * returns plain data out, so it can be exercised directly by the Node test
 * suite (tests/validation.test.js) without spinning up a browser.
 */
(function (global) {
  "use strict";

  var FIELD_ORDER = ["full_name", "email", "phone", "appointment_type", "date", "time", "notes"];
  var REQUIRED_FIELDS = ["full_name", "email", "appointment_type", "date", "time"];

  var FIELD_LABELS = {
    full_name: "Full name",
    email: "Email",
    phone: "Phone",
    appointment_type: "Appointment type",
    date: "Preferred date",
    time: "Preferred time",
    notes: "Notes"
  };

  function fieldLabel(field) {
    return FIELD_LABELS[field] || field;
  }

  /**
   * @param {string} field - one of FIELD_ORDER
   * @param {*} rawValue - the candidate value
   * @param {object} ctx - { appointmentTypes, availableDates, timeSlots, bookedSlots, selectedDate }
   * @returns {string|null} an error message, or null if valid
   */
  function validateField(field, rawValue, ctx) {
    ctx = ctx || {};
    var value = (rawValue === undefined || rawValue === null) ? "" : String(rawValue).trim();

    switch (field) {
      case "full_name":
        if (!value) return "Full name is required.";
        if (value.length < 2) return "Full name looks too short — enter at least 2 characters.";
        if (value.length > 80) return "Full name is too long — 80 characters or fewer, please.";
        if (!/^[a-zA-ZÀ-ſ' -]+$/.test(value)) return "Full name can only contain letters, spaces, hyphens and apostrophes.";
        return null;

      case "email":
        if (!value) return "Email is required.";
        if (value.length > 254) return "That email address is too long.";
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "Enter a valid email address, e.g. name@example.com.";
        return null;

      case "phone":
        if (!value) return null; // optional
        if (!/^[0-9()+\-.\s]+$/.test(value)) return "Phone number can only contain digits and the usual punctuation ( ) + - .";
        if (value.replace(/\D/g, "").length < 7) return "Phone number should have at least 7 digits, e.g. (555) 123-4567.";
        return null;

      case "appointment_type": {
        var types = ctx.appointmentTypes || [];
        if (!value) return "Please choose an appointment type.";
        if (!types.some(function (t) { return t.value === value; })) {
          return "\"" + value + "\" isn't a recognized appointment type. Call describe_current_state to see the valid options.";
        }
        return null;
      }

      case "date": {
        var dates = ctx.availableDates || [];
        if (!value) return "Please choose a date.";
        if (dates.indexOf(value) === -1) {
          return "That date isn't open for booking. Call describe_current_state to see the currently available dates.";
        }
        return null;
      }

      case "time": {
        var slots = ctx.timeSlots || [];
        var booked = ctx.bookedSlots || {};
        var selectedDate = ctx.selectedDate;
        if (!value) return "Please choose a time.";
        if (slots.indexOf(value) === -1) return "\"" + value + "\" isn't a clinic time slot. Valid slots are " + slots.join(", ") + ".";
        if (!selectedDate) return "Choose a date before a time.";
        if (booked[selectedDate + "|" + value]) return "That time is already booked on the selected date. Choose another time.";
        return null;
      }

      case "notes":
        if (value.length > 300) return "Notes must be 300 characters or fewer (currently " + value.length + ").";
        return null;

      default:
        return "Unknown field: " + field + ". Valid fields are " + FIELD_ORDER.join(", ") + ".";
    }
  }

  /**
   * @param {object} fields - current field values, keyed by FIELD_ORDER
   * @param {object} ctx - same shape as validateField's ctx
   * @returns {Array<{field, label, error}>}
   */
  function missingOrInvalidFields(fields, ctx) {
    var problems = [];
    REQUIRED_FIELDS.forEach(function (f) {
      var err = validateField(f, fields[f], ctx);
      if (err) problems.push({ field: f, label: fieldLabel(f), error: err });
    });
    return problems;
  }

  var api = {
    FIELD_ORDER: FIELD_ORDER,
    REQUIRED_FIELDS: REQUIRED_FIELDS,
    fieldLabel: fieldLabel,
    validateField: validateField,
    missingOrInvalidFields: missingOrInvalidFields
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    global.Validation = api;
  }
})(typeof window !== "undefined" ? window : this);
