const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const PR = require('../../lib/poll-required.js');

const YES = 'yes-id';
const NO = 'no-id';
const yesNo = { yes: YES, no: NO };

function q(sharedId, meta, type) {
  const metadata = {};
  Object.keys(meta || {}).forEach(function (k) {
    metadata[k] = [{ value: meta[k] }];
  });
  return {
    sharedId: sharedId,
    metadata: metadata,
    _type: type || 'free_text',
  };
}

function typeOf(entity) {
  return entity._type;
}

describe('PollRequired.isQuestionRequired', () => {
  it('defaults to required when property is missing', () => {
    assert.equal(PR.isQuestionRequired(q('a', {}), yesNo, typeOf), true);
  });

  it('is required when poll_required is yes', () => {
    assert.equal(PR.isQuestionRequired(q('a', { poll_required: YES }), yesNo, typeOf), true);
  });

  it('is optional when poll_required is no', () => {
    assert.equal(PR.isQuestionRequired(q('a', { poll_required: NO }), yesNo, typeOf), false);
  });

  it('never requires instructions', () => {
    assert.equal(
      PR.isQuestionRequired(q('a', { poll_required: YES }, 'instructions'), yesNo, typeOf),
      false
    );
    assert.equal(
      PR.isQuestionRequired(q('a', {}, 'instructions'), yesNo, typeOf),
      false
    );
  });
});

describe('PollRequired.missingRequiredQuestions', () => {
  it('lists required unanswered questions only', () => {
    const questions = [
      q('r1', { poll_required: YES }),
      q('opt', { poll_required: NO }),
      q('r2', {}), // default required
      q('instr', {}, 'instructions'),
      q('answered', { poll_required: YES }),
    ];
    const answersByQuestion = {
      answered: { sharedId: 'ans-1' },
    };
    const missing = PR.missingRequiredQuestions(questions, answersByQuestion, yesNo, typeOf);
    assert.deepEqual(
      missing.map(function (x) {
        return x.sharedId;
      }),
      ['r1', 'r2']
    );
  });
});

describe('PollRequired.finishBlockedMessage', () => {
  it('builds count message for missing required', () => {
    assert.match(PR.finishBlockedMessage(1), /1 required question/i);
    assert.match(PR.finishBlockedMessage(3), /3 required questions/i);
    assert.match(PR.finishBlockedMessage(2), /table of contents/i);
  });
});
