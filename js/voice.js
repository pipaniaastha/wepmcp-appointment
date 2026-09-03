/**
 * Pure helpers for turning a speech-recognition transcript into a form
 * value. No DOM access, no SpeechRecognition API usage here on purpose —
 * that's what makes this half of "voice mapping" directly unit-testable in
 * Node (tests/voice.test.js), the same pattern as data.js/validation.js.
 *
 * IMPORTANT — what this file's tests do and don't prove: they verify the
 * matching/normalization logic against canned transcript strings. They say
 * nothing about whether a real browser's SpeechRecognition engine, given a
 * real microphone and a real human voice, produces a transcript that looks
 * like these test inputs. That half (js/app.js's startVoiceInput) is
 * implemented to the Web Speech API spec but has not been exercised with
 * real audio hardware or any assistive/switch-access device — see README.md
 * for the explicit implemented-to-spec-vs-hardware-verified distinction.
 */
(function (global) {
  "use strict";

  // Spoken email addresses come back from speech engines as words, not
  // symbols (e.g. "jordan at example dot com"). This is a deliberately
  // small, literal mapping, not a general NLP normalizer.
  function normalizeSpokenEmail(text) {
    if (!text) return text;
    var t = String(text).toLowerCase().trim();
    t = t.replace(/\s+at\s+/g, "@");
    t = t.replace(/\s+dot\s+/g, ".");
    t = t.replace(/\s+/g, ""); // an email has no internal spaces
    return t;
  }

  /**
   * Matches a spoken transcript against a fixed list of valid options
   * (e.g. appointment types, available dates, open times), the same way a
   * human would recognize "dental cleaning" as the Dental Cleaning option.
   *
   * @param {Array<{value:string,label:string}>} options
   * @param {string} transcript
   * @returns {string|null} the matching option's value, or null if no
   *   confident single match was found (caller should ask the user to
   *   try again or pick manually — never guesses ambiguously).
   */
  function matchSpokenOption(options, transcript) {
    if (!transcript || !options || !options.length) return null;
    var norm = String(transcript).toLowerCase().trim().replace(/[.,!?]+$/, "");
    if (!norm) return null;

    var exact = options.filter(function (o) {
      var label = String(o.label).toLowerCase();
      var valueAsWords = String(o.value).toLowerCase().replace(/_/g, " ");
      return label === norm || valueAsWords === norm;
    });
    if (exact.length === 1) return exact[0].value;
    if (exact.length > 1) return null; // ambiguous — don't guess

    var partial = options.filter(function (o) {
      var label = String(o.label).toLowerCase();
      return label.indexOf(norm) !== -1 || norm.indexOf(label) !== -1;
    });
    if (partial.length === 1) return partial[0].value;

    return null;
  }

  var api = {
    normalizeSpokenEmail: normalizeSpokenEmail,
    matchSpokenOption: matchSpokenOption
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    global.Voice = api;
  }
})(typeof window !== "undefined" ? window : this);
