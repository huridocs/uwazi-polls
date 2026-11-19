const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const PE = require("../../lib/poll-export.js");

function snapshot(overrides) {
  return Object.assign(
    {
      poll: { title: "Demo Poll", sharedId: "poll1" },
      session: {
        sharedId: "sess1",
        respondent: "Alice",
        status: "in_progress",
        token: "tok-a",
      },
      items: [
        {
          sectionNumber: 1,
          sectionTitle: "Intro",
          questionSharedId: "q-instr",
          questionNumber: 1,
          questionText: "Welcome",
          questionType: "instructions",
          required: false,
          answer: null,
        },
        {
          sectionNumber: 1,
          sectionTitle: "Intro",
          questionSharedId: "q1",
          questionNumber: 2,
          questionText: "Pick one",
          questionType: "choice",
          required: true,
          answer: { selectedLabels: ["Yes"] },
        },
        {
          sectionNumber: 2,
          sectionTitle: "Details",
          questionSharedId: "q2",
          questionNumber: 1,
          questionText: "Comment",
          questionType: "free_text",
          required: false,
          answer: null,
        },
        {
          sectionNumber: 2,
          sectionTitle: "Details",
          questionSharedId: "q3",
          questionNumber: 2,
          questionText: "When",
          questionType: "date",
          required: true,
          answer: { date: Math.floor(Date.UTC(2026, 5, 15) / 1000) },
        },
      ],
    },
    overrides || {},
  );
}

describe("PollExport.formatAnswer", () => {
  it("returns UNANSWERED for null answer on answerable types", () => {
    assert.equal(
      PE.formatAnswer({ questionType: "free_text", answer: null }),
      "UNANSWERED",
    );
  });

  it("formats choice, text, numeric, date", () => {
    assert.equal(
      PE.formatAnswer({
        questionType: "choice",
        answer: { selectedLabels: ["A", "B"] },
      }),
      "A | B",
    );
    assert.equal(
      PE.formatAnswer({ questionType: "free_text", answer: { text: "hello" } }),
      "hello",
    );
    assert.equal(
      PE.formatAnswer({ questionType: "numeric", answer: { numeric: 42 } }),
      "42",
    );
    assert.equal(
      PE.formatAnswer({
        questionType: "date",
        answer: { date: Math.floor(Date.UTC(2026, 5, 15) / 1000) },
      }),
      "2026-06-15",
    );
  });

  it("returns empty for instructions", () => {
    assert.equal(
      PE.formatAnswer({ questionType: "instructions", answer: null }),
      "",
    );
  });
});

describe("PollExport.buildLongCsv", () => {
  it("emits one row per answerable question with UNANSWERED", () => {
    const csv = PE.buildLongCsv(snapshot());
    const lines = csv.trim().split(/\r?\n/);
    assert.equal(
      lines[0],
      "section_number,section_title,question_number,question_text,question_type,required,answer",
    );
    assert.equal(lines.length, 4); // header + 3 answerable (skip instructions)
    assert.match(lines[1], /Pick one/);
    assert.match(lines[1], /Yes/);
    assert.match(lines[2], /UNANSWERED/);
    assert.match(lines[3], /2026-06-15/);
  });
});

describe("PollExport.buildWideCsv", () => {
  it("emits one row per session and columns per answerable question", () => {
    const a = snapshot();
    const b = snapshot({
      session: {
        sharedId: "sess2",
        respondent: "Bob",
        status: "accepted",
        token: "tok-b",
      },
      items: a.items.map(function (it) {
        if (it.questionSharedId === "q2") {
          return Object.assign({}, it, { answer: { text: "Bob says" } });
        }
        if (it.questionSharedId === "q1") {
          return Object.assign({}, it, { answer: null });
        }
        return it;
      }),
    });
    const csv = PE.buildWideCsv([a, b]);
    const lines = csv.trim().split(/\r?\n/);
    assert.equal(lines.length, 3); // header + 2 sessions
    assert.match(lines[0], /session_shared_id/);
    assert.match(lines[0], /respondent/);
    assert.match(lines[0], /S1\.Q2 Pick one/);
    assert.match(lines[1], /Alice/);
    assert.match(lines[1], /Yes/);
    assert.match(lines[1], /UNANSWERED/);
    assert.match(lines[2], /Bob/);
    assert.match(lines[2], /UNANSWERED/); // q1
    assert.match(lines[2], /Bob says/);
  });
});

describe("PollExport.buildPrintHtml", () => {
  it("includes poll title, answers, and UNANSWERED", () => {
    const html = PE.buildPrintHtml(snapshot());
    assert.match(html, /Demo Poll/);
    assert.match(html, /Alice/);
    assert.match(html, /Pick one/);
    assert.match(html, />Yes</);
    assert.match(html, /UNANSWERED/);
    assert.match(html, /@media print/);
  });
});

describe("PollExport.csvEscape", () => {
  it("quotes commas and quotes", () => {
    assert.equal(PE.csvEscape("a,b"), '"a,b"');
    assert.equal(PE.csvEscape('say "hi"'), '"say ""hi"""');
  });
});
