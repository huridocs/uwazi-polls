/**
 * Session / poll answer export: long CSV, wide CSV, print HTML.
 * UMD: Node tests require() this file; seed:pages concatenates into admin + player.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (typeof root === "object") {
    root.PollExport = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var UNANSWERED = "UNANSWERED";

  function isAnswerableType(type) {
    return type && type !== "instructions";
  }

  function csvEscape(value) {
    var s = value == null ? "" : String(value);
    if (/[",\r\n]/.test(s)) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  function toCsvString(rows) {
    return rows
      .map(function (row) {
        return row
          .map(function (cell) {
            return csvEscape(cell);
          })
          .join(",");
      })
      .join("\r\n");
  }

  function formatUnixDate(seconds) {
    var n = Number(seconds);
    if (!n && n !== 0) return "";
    var d = new Date(n * 1000);
    if (Number.isNaN(d.getTime())) return "";
    var y = d.getUTCFullYear();
    var m = String(d.getUTCMonth() + 1).padStart(2, "0");
    var day = String(d.getUTCDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  /**
   * @param {{ questionType: string, answer?: object|null }} item
   */
  function formatAnswer(item) {
    var type = item && item.questionType;
    if (!isAnswerableType(type)) return "";
    var answer = item.answer;
    if (!answer) return UNANSWERED;

    if (type === "choice" || type === "choice_and_text") {
      var labels = answer.selectedLabels || [];
      var parts = labels.slice();
      if (type === "choice_and_text" && answer.text)
        parts.push(String(answer.text));
      if (!parts.length && !answer.text) return UNANSWERED;
      return parts.join(" | ");
    }
    if (type === "free_text") {
      var t = answer.text == null ? "" : String(answer.text);
      return t ? t : UNANSWERED;
    }
    if (type === "numeric") {
      if (
        answer.numeric === null ||
        answer.numeric === undefined ||
        answer.numeric === ""
      ) {
        return UNANSWERED;
      }
      return String(answer.numeric);
    }
    if (type === "date") {
      if (
        answer.date === null ||
        answer.date === undefined ||
        answer.date === ""
      ) {
        return UNANSWERED;
      }
      return formatUnixDate(answer.date) || UNANSWERED;
    }
    return UNANSWERED;
  }

  function answerableItems(snapshot) {
    return (snapshot.items || []).filter(function (it) {
      return isAnswerableType(it.questionType);
    });
  }

  function questionHeader(item) {
    return (
      "S" +
      (item.sectionNumber || "") +
      ".Q" +
      (item.questionNumber || "") +
      " " +
      String(item.questionText || "")
        .replace(/\s+/g, " ")
        .trim()
    );
  }

  /**
   * Long CSV: one row per answerable question in a single session.
   * @param {object} snapshot
   * @returns {string}
   */
  function buildLongCsv(snapshot) {
    var rows = [
      [
        "section_number",
        "section_title",
        "question_number",
        "question_text",
        "question_type",
        "required",
        "answer",
      ],
    ];
    answerableItems(snapshot).forEach(function (it) {
      rows.push([
        it.sectionNumber,
        it.sectionTitle,
        it.questionNumber,
        it.questionText,
        it.questionType,
        it.required ? "yes" : "no",
        formatAnswer(it),
      ]);
    });
    return toCsvString(rows);
  }

  /**
   * Wide CSV: one row per session; columns = meta + each answerable question.
   * Column order comes from the first snapshot that has items.
   * @param {object[]} snapshots
   * @returns {string}
   */
  function buildWideCsv(snapshots) {
    var list = snapshots || [];
    var template = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].items && list[i].items.length) {
        template = list[i];
        break;
      }
    }
    var cols = template ? answerableItems(template) : [];
    var header = [
      "session_shared_id",
      "respondent",
      "status",
      "token",
      "poll_title",
      "poll_shared_id",
    ].concat(
      cols.map(function (it) {
        return questionHeader(it);
      }),
    );
    var rows = [header];
    list.forEach(function (snap) {
      var byQ = Object.create(null);
      answerableItems(snap).forEach(function (it) {
        byQ[it.questionSharedId] = it;
      });
      var sess = (snap && snap.session) || {};
      var poll = (snap && snap.poll) || {};
      var row = [
        sess.sharedId || "",
        sess.respondent || "",
        sess.status || "",
        sess.token || "",
        poll.title || "",
        poll.sharedId || "",
      ];
      cols.forEach(function (col) {
        var it = byQ[col.questionSharedId];
        row.push(it ? formatAnswer(it) : UNANSWERED);
      });
      rows.push(row);
    });
    return toCsvString(rows);
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /**
   * Printable HTML document for one session.
   * @param {object} snapshot
   * @returns {string}
   */
  function buildPrintHtml(snapshot) {
    var poll = snapshot.poll || {};
    var sess = snapshot.session || {};
    var html = "";
    html += '<!DOCTYPE html><html><head><meta charset="utf-8" />';
    html += "<title>" + escapeHtml(poll.title || "Poll answers") + "</title>";
    html += "<style>";
    html +=
      "body{font-family:system-ui,-apple-system,sans-serif;font-size:14px;line-height:1.45;color:#1a1a1a;max-width:48rem;margin:1.5rem auto;padding:0 1rem}";
    html += "h1{font-size:1.35rem;margin:0 0 .35rem}";
    html += ".meta{color:#666;font-size:.85rem;margin:0 0 1.25rem}";
    html +=
      "h2{font-size:1.05rem;margin:1.4rem 0 .5rem;border-bottom:1px solid #ddd;padding-bottom:.25rem}";
    html += ".q{margin:0 0 1rem}";
    html += ".q-label{font-weight:600;margin:0 0 .2rem}";
    html += ".q-meta{color:#666;font-size:.75rem;margin:0 0 .25rem}";
    html += ".q-answer{margin:0;white-space:pre-wrap}";
    html += ".unanswered{color:#b91c1c;font-weight:600}";
    html += ".instr{color:#444;font-style:italic;margin:0 0 1rem}";
    html +=
      "@media print{body{margin:0;max-width:none}.no-print{display:none!important}}";
    html += "</style></head><body>";
    html +=
      '<p class="no-print meta">Use your browser Print dialog to print or save as PDF.</p>';
    html += "<h1>" + escapeHtml(poll.title || "Poll answers") + "</h1>";
    html +=
      '<p class="meta">Respondent: ' +
      escapeHtml(sess.respondent || "—") +
      " · Status: " +
      escapeHtml(sess.status || "—") +
      (sess.sharedId ? " · Session: " + escapeHtml(sess.sharedId) : "") +
      "</p>";

    var currentSection = null;
    (snapshot.items || []).forEach(function (it) {
      var secKey =
        String(it.sectionNumber) + "|" + String(it.sectionTitle || "");
      if (secKey !== currentSection) {
        currentSection = secKey;
        html +=
          "<h2>Section " +
          escapeHtml(it.sectionNumber || "") +
          " — " +
          escapeHtml(it.sectionTitle || "") +
          "</h2>";
      }
      if (it.questionType === "instructions") {
        html +=
          '<p class="instr">' + escapeHtml(it.questionText || "") + "</p>";
        return;
      }
      var ans = formatAnswer(it);
      var ansClass = ans === UNANSWERED ? "q-answer unanswered" : "q-answer";
      html += '<div class="q">';
      html +=
        '<p class="q-meta">Q' +
        escapeHtml(it.questionNumber || "") +
        (it.required ? " · Required" : " · Optional") +
        " · " +
        escapeHtml(it.questionType || "") +
        "</p>";
      html +=
        '<p class="q-label">' + escapeHtml(it.questionText || "") + "</p>";
      html += '<p class="' + ansClass + '">' + escapeHtml(ans) + "</p>";
      html += "</div>";
    });

    html += "</body></html>";
    return html;
  }

  return {
    UNANSWERED: UNANSWERED,
    csvEscape: csvEscape,
    toCsvString: toCsvString,
    formatAnswer: formatAnswer,
    buildLongCsv: buildLongCsv,
    buildWideCsv: buildWideCsv,
    buildPrintHtml: buildPrintHtml,
  };
});
