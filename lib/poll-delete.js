/**
 * Poll cascade delete planning + runner.
 * UMD: Node tests require() this file; seed:pages concatenates it ahead of admin/script.js.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (typeof root === 'object') {
    root.PollDelete = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var CONFIRM_PHRASE = 'DELETE';

  var PHASE_LABELS = {
    answers: 'Deleting answers',
    sessions: 'Deleting sessions',
    questions: 'Deleting questions',
    sections: 'Deleting sections',
    options: 'Deleting unused options',
    poll: 'Deleting poll',
  };

  function metaList(entity, name) {
    var md = entity && entity.metadata;
    var arr = md && md[name];
    return Array.isArray(arr) ? arr : [];
  }

  function metaVal(entity, name) {
    var entry = metaList(entity, name)[0];
    return entry && entry.value !== undefined ? entry.value : undefined;
  }

  function uniqueIds(ids) {
    var seen = Object.create(null);
    var out = [];
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      if (!id || seen[id]) continue;
      seen[id] = true;
      out.push(String(id));
    }
    return out;
  }

  function optionIdsFromEntities(entities, field) {
    var ids = [];
    for (var i = 0; i < (entities || []).length; i++) {
      var list = metaList(entities[i], field);
      for (var j = 0; j < list.length; j++) {
        if (list[j] && list[j].value) ids.push(String(list[j].value));
      }
    }
    return uniqueIds(ids);
  }

  function referencedOptionSet(questions, answers) {
    var set = Object.create(null);
    var fromQ = optionIdsFromEntities(questions, 'poll_available_options');
    var fromA = optionIdsFromEntities(answers, 'poll_selected_options');
    for (var i = 0; i < fromQ.length; i++) set[fromQ[i]] = true;
    for (var j = 0; j < fromA.length; j++) set[fromA[j]] = true;
    return set;
  }

  function isDeleteConfirmed(input) {
    return String(input == null ? '' : input) === CONFIRM_PHRASE;
  }

  /**
   * Build ordered deletion phases for one poll.
   * Options are deleted only when not referenced by otherQuestions / otherAnswers.
   *
   * @param {{
   *   pollSharedId: string,
   *   sections: object[],
   *   questions: object[],
   *   sessions: object[],
   *   answers: object[],
   *   otherQuestions?: object[],
   *   otherAnswers?: object[],
   * }} input
   */
  function planPollDeletion(input) {
    var pollSharedId = String(input.pollSharedId || '');
    var answerIds = uniqueIds(
      (input.answers || []).map(function (e) {
        return e && e.sharedId;
      })
    );
    var sessionIds = uniqueIds(
      (input.sessions || []).map(function (e) {
        return e && e.sharedId;
      })
    );
    var questionIds = uniqueIds(
      (input.questions || []).map(function (e) {
        return e && e.sharedId;
      })
    );
    var sectionIds = uniqueIds(
      (input.sections || []).map(function (e) {
        return e && e.sharedId;
      })
    );

    var candidateOptions = optionIdsFromEntities(input.questions || [], 'poll_available_options');
    var stillUsed = referencedOptionSet(input.otherQuestions || [], input.otherAnswers || []);
    var optionsToDelete = [];
    var retained = 0;
    for (var i = 0; i < candidateOptions.length; i++) {
      var oid = candidateOptions[i];
      if (stillUsed[oid]) retained += 1;
      else optionsToDelete.push(oid);
    }

    var rawPhases = [
      { key: 'answers', ids: answerIds },
      { key: 'sessions', ids: sessionIds },
      { key: 'questions', ids: questionIds },
      { key: 'sections', ids: sectionIds },
      { key: 'options', ids: optionsToDelete },
      { key: 'poll', ids: pollSharedId ? [pollSharedId] : [] },
    ];

    var phases = [];
    for (var p = 0; p < rawPhases.length; p++) {
      var phase = rawPhases[p];
      if (!phase.ids.length) continue;
      phases.push({
        key: phase.key,
        label: PHASE_LABELS[phase.key] || phase.key,
        ids: phase.ids.slice(),
      });
    }

    var counts = {
      answers: answerIds.length,
      sessions: sessionIds.length,
      questions: questionIds.length,
      sections: sectionIds.length,
      options: optionsToDelete.length,
      optionsRetained: retained,
      poll: pollSharedId ? 1 : 0,
      total:
        answerIds.length +
        sessionIds.length +
        questionIds.length +
        sectionIds.length +
        optionsToDelete.length +
        (pollSharedId ? 1 : 0),
    };

    return {
      pollSharedId: pollSharedId,
      counts: counts,
      phases: phases,
    };
  }

  /**
   * @param {ReturnType<typeof planPollDeletion>} plan
   * @param {{
   *   deleteSharedIds: (ids: string[]) => Promise<void>,
   *   onProgress?: (ev: object) => void,
   *   chunkSize?: number,
   * }} opts
   */
  async function runPollDeletion(plan, opts) {
    var deleteSharedIds = opts.deleteSharedIds;
    var onProgress = opts.onProgress || function () {};
    var chunkSize = Math.max(1, Number(opts.chunkSize) || 25);
    var total = plan.counts.total;
    var done = 0;
    var phases = plan.phases || [];

    for (var i = 0; i < phases.length; i++) {
      var phase = phases[i];
      var ids = phase.ids || [];
      for (var offset = 0; offset < ids.length; offset += chunkSize) {
        var chunk = ids.slice(offset, offset + chunkSize);
        await deleteSharedIds(chunk);
        done += chunk.length;
        onProgress({
          phase: phase.key,
          label: phase.label,
          phaseIndex: i,
          phaseCount: phases.length,
          done: done,
          total: total,
        });
      }
    }

    return { deleted: done, total: total };
  }

  return {
    CONFIRM_PHRASE: CONFIRM_PHRASE,
    isDeleteConfirmed: isDeleteConfirmed,
    planPollDeletion: planPollDeletion,
    runPollDeletion: runPollDeletion,
    optionIdsFromEntities: optionIdsFromEntities,
    metaVal: metaVal,
  };
});
