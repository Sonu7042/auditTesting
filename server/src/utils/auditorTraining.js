const DEFAULT_QUIZ = [
  { id: "q1", text: "Evidence for an audit item must be captured using:", options: ["The phone gallery", "The in-app camera only", "Any messaging app", "A photo sent by the dealer"], answer: 1 },
  { id: "q2", text: "An audit can be started only when the auditor is:", options: ["Within the geofence of the site", "Anywhere in the city", "At the regional office", "Connected to dealer Wi-Fi"], answer: 0 },
  { id: "q3", text: "For an item that is OK, the required evidence is:", options: ["A photo and a long comment", "A photo, no comment", "Only a comment", "Nothing"], answer: 1 },
  { id: "q4", text: "For a Not OK item left open, the auditor records:", options: ["A photo only", "A photo, an issue comment and a recommendation comment", "A recommendation only", "A verbal note to the dealer"], answer: 1 },
  { id: "q5", text: "For a Not OK item closed on the spot, the auditor also records:", options: ["Nothing extra", "A correction photo and a correction comment", "A signature only", "A new checklist item"], answer: 1 },
  { id: "q6", text: "Marking an item Not Applicable requires:", options: ["Manager approval", "A mandatory reason", "A second auditor", "No explanation"], answer: 1 },
  { id: "q7", text: "Exposed live parts at a main panel should be treated as:", options: ["A minor observation", "An immediate-danger (P0) finding to escalate", "A documentation gap", "Not an audit matter"], answer: 1 },
  { id: "q8", text: "Which instrument must have a valid calibration date before measuring earth resistance?", options: ["Lux meter", "Earth resistance tester", "Measuring tape", "Mobile phone"], answer: 1 },
  { id: "q9", text: "If a dealer asks you to change a finding, you should:", options: ["Change it to keep relations good", "Record the finding as observed and note the dealer's comment", "Delete the photo", "Skip the item"], answer: 1 },
  { id: "q10", text: "Suspected tampering with evidence by an auditor leads to:", options: ["A warning only", "Immediate suspension and escalation", "A bonus review", "No action"], answer: 1 },
];

const DEFAULT_DEMO = [
  { id: "d1", title: "Fire extinguisher", scenario: "Photo shows a dry-powder extinguisher with the inspection tag expired 8 months ago, mounted at the correct height in the workshop.", expected: "NOT_OK", expectedNote: "Expired inspection tag. Record the photo, comment on the expiry date and recommend refilling or replacement." },
  { id: "d2", title: "Main LT panel", scenario: "Photo shows a closed panel with labels, an insulating mat in front, and a shock-treatment chart displayed.", expected: "OK", expectedNote: "Compliant. A photo is enough, with no comment." },
  { id: "d3", title: "Cable termination", scenario: "Photo shows cables entering a distribution board without glands, and lugs missing at two terminations.", expected: "NOT_OK", expectedNote: "Missing glands and lugs. Raise a finding with a photo, comment and recommendation." },
  { id: "d4", title: "Emergency exit", scenario: "Photo shows the workshop exit door blocked by stacked tyres, with exit signage lit above it.", expected: "NOT_OK", expectedNote: "Blocked exit is an immediate-danger item. Escalate and record a correction photo if cleared on the spot." },
];

module.exports = { DEFAULT_QUIZ, DEFAULT_DEMO };
