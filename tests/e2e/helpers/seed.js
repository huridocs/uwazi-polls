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
  const needed = ['Poll', 'Section', 'Question', 'Option', 'Session', 'Answer'];
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
    sessionStatus: valuesFor('Session status'),
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

  const sharedIds = [poll.sharedId, secA.sharedId, secB.sharedId, qA.sharedId, qB.sharedId];
  await grantRespondentsAccess(request, sharedIds, 'read');

  return {
    poll,
    sections: [secA, secB],
    questions: [qA, qB],
    sharedIds,
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

/**
 * Question titles in a section, ordered by poll_number.
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {string} sectionSharedId
 */
async function questionOrderByNumber(request, sectionSharedId) {
  const schema = await resolvePollSchema(request);
  const data = await api(
    request,
    'GET',
    `/api/search?types=${encodeURIComponent(JSON.stringify([schema.templates.Question]))}&includeUnpublished=true&limit=3000`
  );
  const rows = (data.rows || []).filter(r => {
    const rel = (r.metadata && r.metadata.poll_section) || [];
    return rel[0] && rel[0].value === sectionSharedId;
  });
  rows.sort((a, b) => {
    const na = (((a.metadata || {}).poll_number || [])[0] || {}).value || 0;
    const nb = (((b.metadata || {}).poll_number || [])[0] || {}).value || 0;
    return na - nb;
  });
  return rows.map(r => r.title);
}

const RESPONDENTS_GROUP_NAME = '[Poll] Respondents';

/**
 * Ensure “[Poll] Respondents” exists (admin login required).
 * @param {import('@playwright/test').APIRequestContext} request
 */
async function ensureRespondentsGroup(request) {
  const rows = await api(request, 'GET', '/api/usergroups');
  const list = Array.isArray(rows) ? rows : rows?.rows || [];
  let found = list.find(
    g => String(g.name || '').trim().toLowerCase() === RESPONDENTS_GROUP_NAME.toLowerCase()
  );
  if (!found) {
    found = await api(request, 'POST', '/api/usergroups', {
      name: RESPONDENTS_GROUP_NAME,
      members: [],
    });
  }
  return found;
}

/**
 * Merge Respondents group access onto entities (bulk merge when 2+ ids).
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {string[]} sharedIds
 * @param {'read'|'write'} level
 */
async function grantRespondentsAccess(request, sharedIds, level) {
  const ids = (sharedIds || []).filter(Boolean).map(String);
  if (!ids.length) return;
  const group = await ensureRespondentsGroup(request);
  const groupId = String(group._id);
  const chunkSize = 40;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    if (chunk.length === 1) {
      const current = await api(request, 'PUT', '/api/entities/permissions/', {
        sharedIds: chunk,
      });
      const next = [];
      (current || []).forEach(p => {
        if (!p || p.type === 'public' || p.level === 'mixed') return;
        if (String(p.refId) === groupId) return;
        next.push({
          refId: String(p.refId),
          type: p.type,
          level: p.level === 'write' ? 'write' : 'read',
        });
      });
      next.push({ refId: groupId, type: 'group', level });
      await api(request, 'POST', '/api/entities/permissions', {
        ids: chunk,
        permissions: next,
      });
    } else {
      await api(request, 'POST', '/api/entities/permissions', {
        ids: chunk,
        permissions: [{ refId: groupId, type: 'group', level }],
      });
    }
  }
}

/**
 * Create an in-progress session for a poll (player needs ?poll=&token=).
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {string} pollSharedId
 * @param {string} [token]
 */
async function createPollSession(request, pollSharedId, token) {
  const schema = await resolvePollSchema(request);
  const tok = token || `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const session = await createEntity(request, `E2E session ${tok}`, schema.templates.Session, {
    poll_poll: [{ value: pollSharedId }],
    poll_session_status: [{ value: schema.sessionStatus.in_progress }],
    poll_respondent: [{ value: 'e2e' }],
    poll_token: [{ value: tok }],
  });
  await grantRespondentsAccess(request, [session.sharedId], 'write');
  return { session, token: tok };
}

/**
 * Soft-claim / pre-assign a session to a user (hub lists these).
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {object} session
 * @param {{ _id: string, username?: string, email?: string }} user
 * @param {string} [token]
 */
async function assignSessionToUser(request, session, user, token) {
  const schema = await resolvePollSchema(request);
  const label = user.username || user.email || String(user._id);
  const tok = token || ((((session.metadata || {}).poll_token || [])[0] || {}).value);
  const metadata = {
    poll_poll: (session.metadata && session.metadata.poll_poll) || [],
    poll_session_status: [
      {
        value:
          (((session.metadata || {}).poll_session_status || [])[0] || {}).value ||
          schema.sessionStatus.in_progress,
      },
    ],
    poll_respondent: [
      {
        value: (((session.metadata || {}).poll_respondent || [])[0] || {}).value || 'e2e',
      },
    ],
    poll_claimed_by: [{ value: label }],
    poll_claimed_user: [{ value: String(user._id) }],
  };
  if (tok) metadata.poll_token = [{ value: tok }];
  const answered = (((session.metadata || {}).poll_answered_count || [])[0] || {}).value;
  const qCount = (((session.metadata || {}).poll_question_count || [])[0] || {}).value;
  if (answered !== undefined) metadata.poll_answered_count = [{ value: answered }];
  if (qCount !== undefined) metadata.poll_question_count = [{ value: qCount }];

  const saved = await api(request, 'POST', '/api/entities', {
    _id: session._id,
    sharedId: session.sharedId,
    title: session.title,
    template: schema.templates.Session,
    published: false,
    language: 'en',
    metadata,
  });
  const ent = saved.entity || saved;
  await api(request, 'POST', '/api/entities/permissions', {
    ids: [session.sharedId],
    permissions: [{ refId: String(user._id), type: 'user', level: 'write' }],
  });
  return ent;
}

/**
 * Answers for a session, newest-first by title for stable assertions.
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {string} sessionSharedId
 */
async function answersForSession(request, sessionSharedId) {
  const schema = await resolvePollSchema(request);
  const data = await api(
    request,
    'GET',
    `/api/search?types=${encodeURIComponent(JSON.stringify([schema.templates.Answer]))}&includeUnpublished=true&limit=3000`
  );
  return (data.rows || []).filter(r => {
    const rel = (r.metadata && r.metadata.poll_session) || [];
    return rel[0] && rel[0].value === sessionSharedId;
  });
}

/**
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {string} templateId
 * @param {string} title
 */
async function findEntityByTitle(request, templateId, title) {
  const data = await api(
    request,
    'GET',
    `/api/search?types=${encodeURIComponent(JSON.stringify([templateId]))}&includeUnpublished=true&limit=3000`
  );
  return (data.rows || []).find(r => r.title === title) || null;
}

/**
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {string} questionText
 */
async function findQuestionByText(request, questionText) {
  const schema = await resolvePollSchema(request);
  const data = await api(
    request,
    'GET',
    `/api/search?types=${encodeURIComponent(JSON.stringify([schema.templates.Question]))}&includeUnpublished=true&limit=3000`
  );
  return (
    (data.rows || []).find(r => {
      const text = (((r.metadata || {}).poll_question_text || [])[0] || {}).value;
      return text === questionText;
    }) || null
  );
}

/**
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {string} sessionSharedId
 */
async function loadSession(request, sessionSharedId) {
  const schema = await resolvePollSchema(request);
  const data = await api(
    request,
    'GET',
    `/api/search?types=${encodeURIComponent(JSON.stringify([schema.templates.Session]))}&includeUnpublished=true&limit=3000`
  );
  return (data.rows || []).find(r => r.sharedId === sessionSharedId) || null;
}

/**
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {string} sessionSharedId
 */
async function deleteAnswersForSession(request, sessionSharedId) {
  const answers = await answersForSession(request, sessionSharedId);
  await deleteEntities(
    request,
    answers.map(a => a.sharedId)
  );
}

module.exports = {
  resolvePollSchema,
  createEntity,
  seedTwoSectionPoll,
  deleteEntities,
  sectionOrderByNumber,
  questionOrderByNumber,
  ensureRespondentsGroup,
  grantRespondentsAccess,
  createPollSession,
  assignSessionToUser,
  answersForSession,
  findEntityByTitle,
  findQuestionByText,
  loadSession,
  deleteAnswersForSession,
  RESPONDENTS_GROUP_NAME,
};
