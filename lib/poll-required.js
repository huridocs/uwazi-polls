/**
 * Required/optional question helpers for poll admin + player.
 * UMD: Node tests require() this file; seed:pages concatenates it into page scripts.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (typeof root === 'object') {
    root.PollRequired = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function metaList(entity, name) {
    var md = entity && entity.metadata;
    var arr = md && md[name];
    return Array.isArray(arr) ? arr : [];
  }

  function metaVal(entity, name) {
    var entry = metaList(entity, name)[0];
    return entry && entry.value !== undefined ? entry.value : undefined;
  }

  /**
   * Missing/unknown poll_required defaults to required.
   * Instructions are never required.
   *
   * @param {object} question
   * @param {{ yes: string, no: string }} yesNo
   * @param {(q: object) => string} questionTypeFn
   */
  function isQuestionRequired(question, yesNo, questionTypeFn) {
    var type = questionTypeFn ? questionTypeFn(question) : '';
    if (type === 'instructions') return false;
    var raw = metaVal(question, 'poll_required');
    if (raw === undefined || raw === null || raw === '') return true;
    if (yesNo && yesNo.no && String(raw) === String(yesNo.no)) return false;
    return true;
  }

  /**
   * @param {object[]} questions
   * @param {Record<string, object>} answersByQuestion
   * @param {{ yes: string, no: string }} yesNo
   * @param {(q: object) => string} questionTypeFn
   */
  function missingRequiredQuestions(questions, answersByQuestion, yesNo, questionTypeFn) {
    var answers = answersByQuestion || {};
    return (questions || []).filter(function (q) {
      if (!q || !q.sharedId) return false;
      if (!isQuestionRequired(q, yesNo, questionTypeFn)) return false;
      return !answers[q.sharedId];
    });
  }

  function finishBlockedMessage(count) {
    var n = Number(count) || 0;
    var label =
      n === 1 ? '1 required question is still unanswered' : n + ' required questions are still unanswered';
    return (
      label +
      '. Open the table of contents to find them (marked as required), answer each one, then finish again.'
    );
  }

  return {
    isQuestionRequired: isQuestionRequired,
    missingRequiredQuestions: missingRequiredQuestions,
    finishBlockedMessage: finishBlockedMessage,
    metaVal: metaVal,
  };
});
