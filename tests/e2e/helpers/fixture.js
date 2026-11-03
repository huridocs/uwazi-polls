/**
 * Shared poll fixture for Playwright specs.
 * Builds a small 2-section poll (mixed types) and cleans up afterwards.
 */
const { api } = require('./uwazi');
const {
  resolvePollSchema,
  createEntity,
  deleteEntities,
  createPollSession,
  grantRespondentsAccess,
  assignSessionToUser,
} = require('./seed');

/**
 * @param {import('@playwright/test').APIRequestContext} request
 */
async function createMixedPollFixture(request) {
  const schema = await resolvePollSchema(request);
  const T = schema.templates;
  const stamp = Date.now();

  const poll = await createEntity(request, `Fixture poll ${stamp}`, T.Poll, {
    poll_description: [{ value: 'Shared Playwright fixture — safe to delete.' }],
    poll_status: [{ value: schema.pollStatus.draft }],
  });

  const secA = await createEntity(request, 'Section Alpha', T.Section, {
    poll_number: [{ value: 1 }],
    poll_description: [{ value: 'First' }],
    poll_poll: [{ value: poll.sharedId }],
  });
  const secB = await createEntity(request, 'Section Beta', T.Section, {
    poll_number: [{ value: 2 }],
    poll_description: [{ value: 'Second' }],
    poll_poll: [{ value: poll.sharedId }],
  });

  // Minimal options for choice questions
  const optYes = await createEntity(request, `Yes ${stamp}`, T.Option, {
    poll_label: [{ value: 'Yes' }],
  });
  const optNo = await createEntity(request, `No ${stamp}`, T.Option, {
    poll_label: [{ value: 'No' }],
  });

  const qGuide = await createEntity(request, 'A1 Guide', T.Question, {
    poll_number: [{ value: 1 }],
    poll_question_text: [{ value: 'Welcome guidance' }],
    poll_type: [{ value: schema.qType.instructions }],
    poll_allow_multiple: [{ value: schema.yesNo.no }],
    poll_section: [{ value: secA.sharedId }],
    poll_poll: [{ value: poll.sharedId }],
  });
  const qChoice = await createEntity(request, 'A2 Choice', T.Question, {
    poll_number: [{ value: 2 }],
    poll_question_text: [{ value: 'Alpha choice question' }],
    poll_type: [{ value: schema.qType.choice }],
    poll_allow_multiple: [{ value: schema.yesNo.no }],
    poll_section: [{ value: secA.sharedId }],
    poll_poll: [{ value: poll.sharedId }],
    poll_available_options: [{ value: optYes.sharedId }, { value: optNo.sharedId }],
  });
  const qText = await createEntity(request, 'B1 Text', T.Question, {
    poll_number: [{ value: 1 }],
    poll_question_text: [{ value: 'Beta free text' }],
    poll_type: [{ value: schema.qType.free_text }],
    poll_allow_multiple: [{ value: schema.yesNo.no }],
    poll_section: [{ value: secB.sharedId }],
    poll_poll: [{ value: poll.sharedId }],
  });
  const qDate = await createEntity(request, 'B2 Date', T.Question, {
    poll_number: [{ value: 2 }],
    poll_question_text: [{ value: 'Beta date question' }],
    poll_type: [{ value: schema.qType.date }],
    poll_allow_multiple: [{ value: schema.yesNo.no }],
    poll_section: [{ value: secB.sharedId }],
    poll_poll: [{ value: poll.sharedId }],
  });

  const sharedIds = [
    poll.sharedId,
    secA.sharedId,
    secB.sharedId,
    optYes.sharedId,
    optNo.sharedId,
    qGuide.sharedId,
    qChoice.sharedId,
    qText.sharedId,
    qDate.sharedId,
  ];

  await grantRespondentsAccess(request, sharedIds, 'read');

  return {
    poll,
    sections: [secA, secB],
    questions: { guide: qGuide, choice: qChoice, text: qText, date: qDate },
    options: { yes: optYes, no: optNo },
    sharedIds,
    /**
     * Attach an in-progress session so the player can open ?poll=&token=.
     */
    async withSession(opts) {
      opts = opts || {};
      const { session, token } = await createPollSession(request, poll.sharedId);
      sharedIds.push(session.sharedId);
      if (opts.assignToUser) {
        const claimed = await assignSessionToUser(request, session, opts.assignToUser, token);
        return { session: claimed, token };
      }
      return { session, token };
    },
    async cleanup() {
      await deleteEntities(request, sharedIds);
    },
  };
}

module.exports = { createMixedPollFixture, deleteEntities, resolvePollSchema, api };
