const { api } = require('./uwazi');

/**
 * Resolve [Poll]* template ids and status/type thesaurus values from the live instance.
 * @param {import('@playwright/test').APIRequestContext} request
 */
async function resolvePollSchema(request) {
  const templates = await api(request, 'GET', '/api/templates');
  const rows = templates.rows || templates;
  const byName = {};
  for (const t of rows) {
    if (t.name && t.name.indexOf('[Poll]') === 0) {
      byName[t.name.replace('[Poll] ', '')] = t._id;
    }
  }
  const needed = ['Poll', 'Section', 'Question', 'Option'];
  for (const k of needed) {
    if (!byName[k]) throw new Error(`Missing template [Poll] ${k}`);
  }

  const thesauri = await api(request, 'GET', '/api/thesauris');
  const thRows = thesauri.rows || thesauri;
  function valuesFor(labelPart) {
    const th = thRows.find(
      t => t.name && t.name.indexOf('[Poll]') === 0 && t.name.indexOf(labelPart) !== -1
    );
    if (!th) throw new Error(`Missing thesaurus containing ${labelPart}`);
    const out = {};
    for (const v of th.values || []) out[v.label] = v.id;
    return out;
  }

  return {
    templates: byName,
    pollStatus: valuesFor('Poll status'),
    qType: valuesFor('Question type'),
    yesNo: valuesFor('Yes No'),
  };
}

/**
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {string} title
 * @param {string} template
 * @param {object} metadata
 */
async function createEntity(request, title, template, metadata) {
  const saved = await api(request, 'POST', '/api/entities', {
    title,
    template,
    published: false,
    language: 'en',
    metadata,
  });
  return saved.entity || saved;
}

/**
 * Minimal poll: 2 sections, one free_text question each — enough for section DnD.
 * @param {import('@playwright/test').APIRequestContext} request
 */
async function seedTwoSectionPoll(request) {
  const schema = await resolvePollSchema(request);
  const T = schema.templates;
  const stamp = Date.now();
  const poll = await createEntity(request, `DnD fixture ${stamp}`, T.Poll, {
    poll_description: [{ value: 'Playwright structure drag fixture — safe to delete.' }],
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

  const qA = await createEntity(request, 'A1 Placeholder', T.Question, {
    poll_number: [{ value: 1 }],
    poll_question_text: [{ value: 'Alpha question' }],
    poll_type: [{ value: schema.qType.free_text }],
    poll_allow_multiple: [{ value: schema.yesNo.no }],
    poll_section: [{ value: secA.sharedId }],
    poll_poll: [{ value: poll.sharedId }],
  });
  const qB = await createEntity(request, 'B1 Placeholder', T.Question, {
    poll_number: [{ value: 1 }],
    poll_question_text: [{ value: 'Beta question' }],
    poll_type: [{ value: schema.qType.free_text }],
    poll_allow_multiple: [{ value: schema.yesNo.no }],
    poll_section: [{ value: secB.sharedId }],
    poll_poll: [{ value: poll.sharedId }],
  });

  return {
    poll,
    sections: [secA, secB],
    questions: [qA, qB],
    sharedIds: [poll.sharedId, secA.sharedId, secB.sharedId, qA.sharedId, qB.sharedId],
  };
}

/**
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {string[]} sharedIds
 */
async function deleteEntities(request, sharedIds) {
  for (const sharedId of sharedIds) {
    try {
      await api(request, 'DELETE', `/api/entities?sharedId=${encodeURIComponent(sharedId)}`);
    } catch (err) {
      // best-effort cleanup
      console.warn('cleanup failed for', sharedId, err.message);
    }
  }
}

/**
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {string} pollSharedId
 */
async function sectionOrderByNumber(request, pollSharedId) {
  const schema = await resolvePollSchema(request);
  const data = await api(
    request,
    'GET',
    `/api/search?types=${encodeURIComponent(JSON.stringify([schema.templates.Section]))}&includeUnpublished=true&limit=3000`
  );
  const rows = (data.rows || []).filter(r => {
    const rel = (r.metadata && r.metadata.poll_poll) || [];
    return rel[0] && rel[0].value === pollSharedId;
  });
  rows.sort((a, b) => {
    const na = (((a.metadata || {}).poll_number || [])[0] || {}).value || 0;
    const nb = (((b.metadata || {}).poll_number || [])[0] || {}).value || 0;
    return na - nb;
  });
  return rows.map(r => r.title);
}

module.exports = {
  resolvePollSchema,
  createEntity,
  seedTwoSectionPoll,
  deleteEntities,
  sectionOrderByNumber,
};
