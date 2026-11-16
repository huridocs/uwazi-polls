const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const PD = require('../../lib/poll-delete.js');

function ent(sharedId, meta) {
  const metadata = {};
  Object.keys(meta || {}).forEach(function (k) {
    const v = meta[k];
    if (Array.isArray(v)) {
      metadata[k] = v.map(function (x) {
        return typeof x === 'string' ? { value: x } : x;
      });
    } else {
      metadata[k] = [{ value: v }];
    }
  });
  return { sharedId: sharedId, metadata: metadata };
}

describe('PollDelete.isDeleteConfirmed', () => {
  it('accepts exact DELETE only', () => {
    assert.equal(PD.isDeleteConfirmed('DELETE'), true);
    assert.equal(PD.isDeleteConfirmed('DELETE '), false);
    assert.equal(PD.isDeleteConfirmed('delete'), false);
    assert.equal(PD.isDeleteConfirmed(''), false);
    assert.equal(PD.isDeleteConfirmed(null), false);
  });
});

describe('PollDelete.planPollDeletion', () => {
  it('orders cascade and counts retained shared options', () => {
    const pollId = 'poll-1';
    const sharedOpt = 'opt-shared';
    const onlyHere = 'opt-only';

    const sections = [ent('sec-1', { poll_poll: pollId })];
    const pollQuestions = [
      ent('q-1', {
        poll_poll: pollId,
        poll_available_options: [sharedOpt, onlyHere],
      }),
    ];
    const sessions = [ent('sess-1', { poll_poll: pollId })];
    const answers = [
      ent('ans-1', {
        poll_session: 'sess-1',
        poll_selected_options: [onlyHere],
      }),
    ];
    const otherQuestions = [
      ent('q-other', {
        poll_poll: 'poll-2',
        poll_available_options: [sharedOpt],
      }),
    ];

    const plan = PD.planPollDeletion({
      pollSharedId: pollId,
      sections: sections,
      questions: pollQuestions,
      sessions: sessions,
      answers: answers,
      otherQuestions: otherQuestions,
      otherAnswers: [],
    });

    assert.equal(plan.pollSharedId, pollId);
    assert.deepEqual(plan.counts, {
      answers: 1,
      sessions: 1,
      questions: 1,
      sections: 1,
      options: 1,
      optionsRetained: 1,
      poll: 1,
      total: 6,
    });
    assert.deepEqual(plan.phases.map(function (p) {
      return p.key;
    }), ['answers', 'sessions', 'questions', 'sections', 'options', 'poll']);
    assert.deepEqual(plan.phases.find(function (p) {
      return p.key === 'options';
    }).ids, [onlyHere]);
    assert.deepEqual(plan.phases.find(function (p) {
      return p.key === 'poll';
    }).ids, [pollId]);
  });

  it('keeps options referenced by other answers', () => {
    const pollId = 'poll-a';
    const opt = 'opt-x';
    const plan = PD.planPollDeletion({
      pollSharedId: pollId,
      sections: [],
      questions: [ent('q1', { poll_poll: pollId, poll_available_options: [opt] })],
      sessions: [],
      answers: [],
      otherQuestions: [],
      otherAnswers: [ent('a-other', { poll_selected_options: [opt] })],
    });
    assert.equal(plan.counts.options, 0);
    assert.equal(plan.counts.optionsRetained, 1);
    assert.equal(
      plan.phases.some(function (p) {
        return p.key === 'options';
      }),
      false
    );
  });

  it('skips empty phases in phase list but keeps zero counts', () => {
    const plan = PD.planPollDeletion({
      pollSharedId: 'p',
      sections: [],
      questions: [],
      sessions: [],
      answers: [],
      otherQuestions: [],
      otherAnswers: [],
    });
    assert.equal(plan.counts.total, 1);
    assert.deepEqual(
      plan.phases.map(function (p) {
        return p.key;
      }),
      ['poll']
    );
  });
});

describe('PollDelete.runPollDeletion', () => {
  it('deletes in phase order and reports progress', async () => {
    const plan = PD.planPollDeletion({
      pollSharedId: 'p1',
      sections: [ent('s1', { poll_poll: 'p1' })],
      questions: [ent('q1', { poll_poll: 'p1' })],
      sessions: [ent('se1', { poll_poll: 'p1' })],
      answers: [ent('a1', { poll_session: 'se1' })],
      otherQuestions: [],
      otherAnswers: [],
    });

    const deleted = [];
    const progress = [];
    await PD.runPollDeletion(plan, {
      chunkSize: 1,
      deleteSharedIds: async function (ids) {
        deleted.push(ids.slice());
      },
      onProgress: function (ev) {
        progress.push({
          label: ev.label,
          done: ev.done,
          total: ev.total,
          phase: ev.phase,
        });
      },
    });

    assert.deepEqual(deleted, [['a1'], ['se1'], ['q1'], ['s1'], ['p1']]);
    assert.ok(progress.length >= 5);
    assert.equal(progress[progress.length - 1].done, plan.counts.total);
    assert.equal(progress[progress.length - 1].total, plan.counts.total);
  });
});
