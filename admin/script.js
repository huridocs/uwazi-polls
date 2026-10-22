/* Poll admin — pages-based; requires logged-in admin/editor.
 * Expects PollSmDetails (lib/sm-details.js) to be loaded first when published via seed:pages.
 */
(function () {
  var SM = typeof PollSmDetails !== 'undefined' ? PollSmDetails : null;
  var DOCS_URL =
    'https://github.com/huridocs/uwazi-polls#surveymonkey-import--export';

  var CONFIG = {
    // Filled at runtime by matching [Poll] names/labels on the instance.
    templates: {
      Option: '',
      Poll: '',
      Section: '',
      Question: '',
      Session: '',
      Answer: '',
    },
    qType: {
      choice: '',
      free_text: '',
      numeric: '',
      date: '',
      choice_and_text: '',
      instructions: '',
    },
    pollStatus: {
      draft: '',
      published: '',
      closed: '',
    },
    yesNo: {
      yes: '',
      no: '',
    },
    sessionStatus: {
      in_progress: '',
      accepted: '',
    },
    thesauri: {
      pollStatus: '',
      qType: '',
      yesNo: '',
      sessionStatus: '',
    },
    relationTypes: {
      belongs: '',
      hasOption: '',
      selected: '',
    },
    // Set at boot from the "Poll player" Page on this instance (never hardcode sharedIds).
    playerPage: '',
  };

  /** Match by name/label only; ids are refreshed from whatever exists on the instance. */
  var NS = '[Poll] ';

  var EXPECTED_RELATION_TYPES = [
    { key: 'belongs', name: NS + 'belongs to' },
    { key: 'hasOption', name: NS + 'has option' },
    { key: 'selected', name: NS + 'selected option' },
  ];

  var EXPECTED_THESAURI = [
    {
      key: 'pollStatus',
      name: NS + 'Poll status',
      valuesKey: 'pollStatus',
      values: [
        { key: 'draft', label: 'draft' },
        { key: 'published', label: 'published' },
        { key: 'closed', label: 'closed' },
      ],
    },
    {
      key: 'qType',
      name: NS + 'Question type',
      valuesKey: 'qType',
      values: [
        { key: 'choice', label: 'choice' },
        { key: 'free_text', label: 'free_text' },
        { key: 'numeric', label: 'numeric' },
        { key: 'date', label: 'date' },
        { key: 'choice_and_text', label: 'choice_and_text' },
        { key: 'instructions', label: 'instructions' },
      ],
    },
    {
      key: 'yesNo',
      name: NS + 'Yes No',
      valuesKey: 'yesNo',
      values: [
        { key: 'yes', label: 'yes' },
        { key: 'no', label: 'no' },
      ],
    },
    {
      key: 'sessionStatus',
      name: NS + 'Session status',
      valuesKey: 'sessionStatus',
      values: [
        { key: 'in_progress', label: 'in_progress' },
        { key: 'accepted', label: 'accepted' },
      ],
    },
  ];

  /** Expected poll domain templates — matched by name; properties by name/type/links. */
  var EXPECTED_TEMPLATES = [
    {
      key: 'Option',
      name: NS + 'Option',
      properties: [
        { name: 'poll_label', label: 'Poll label', type: 'text' },
      ],
    },
    {
      key: 'Poll',
      name: NS + 'Poll',
      properties: [
        { name: 'poll_description', label: 'Poll description', type: 'markdown' },
        { name: 'poll_status', label: 'Poll status', type: 'select', thesaurus: 'pollStatus', filter: true },
      ],
    },
    {
      key: 'Section',
      name: NS + 'Section',
      properties: [
        { name: 'poll_number', label: 'Poll number', type: 'numeric', filter: true },
        { name: 'poll_description', label: 'Poll description', type: 'markdown' },
        {
          name: 'poll_poll',
          label: 'Poll poll',
          type: 'relationship',
          contentKey: 'Poll',
          relationTypeKey: 'belongs',
          filter: true,
        },
      ],
    },
    {
      key: 'Question',
      name: NS + 'Question',
      properties: [
        { name: 'poll_number', label: 'Poll number', type: 'numeric' },
        { name: 'poll_question_text', label: 'Poll question text', type: 'markdown' },
        { name: 'poll_type', label: 'Poll type', type: 'select', thesaurus: 'qType', filter: true },
        {
          name: 'poll_allow_multiple',
          label: 'Poll allow multiple',
          type: 'select',
          thesaurus: 'yesNo',
          filter: true,
        },
        { name: 'poll_text_prompt', label: 'Poll text prompt', type: 'text' },
        {
          name: 'poll_section',
          label: 'Poll section',
          type: 'relationship',
          contentKey: 'Section',
          relationTypeKey: 'belongs',
          filter: true,
        },
        {
          name: 'poll_poll',
          label: 'Poll poll',
          type: 'relationship',
          contentKey: 'Poll',
          relationTypeKey: 'belongs',
          filter: true,
        },
        {
          name: 'poll_available_options',
          label: 'Poll available options',
          type: 'relationship',
          contentKey: 'Option',
          relationTypeKey: 'hasOption',
        },
      ],
    },
    {
      key: 'Session',
      name: NS + 'Session',
      properties: [
        {
          name: 'poll_poll',
          label: 'Poll poll',
          type: 'relationship',
          contentKey: 'Poll',
          relationTypeKey: 'belongs',
          filter: true,
        },
        {
          name: 'poll_session_status',
          label: 'Poll session status',
          type: 'select',
          thesaurus: 'sessionStatus',
          filter: true,
        },
        { name: 'poll_respondent', label: 'Poll respondent', type: 'text' },
        { name: 'poll_accepted_at', label: 'Poll accepted at', type: 'date' },
        { name: 'poll_token', label: 'Poll token', type: 'text' },
      ],
    },
    {
      key: 'Answer',
      name: NS + 'Answer',
      properties: [
        {
          name: 'poll_session',
          label: 'Poll session',
          type: 'relationship',
          contentKey: 'Session',
          relationTypeKey: 'belongs',
          filter: true,
        },
        {
          name: 'poll_question',
          label: 'Poll question',
          type: 'relationship',
          contentKey: 'Question',
          relationTypeKey: 'belongs',
          filter: true,
        },
        {
          name: 'poll_selected_options',
          label: 'Poll selected options',
          type: 'relationship',
          contentKey: 'Option',
          relationTypeKey: 'selected',
          filter: true,
        },
        { name: 'poll_text', label: 'Poll text', type: 'text' },
        { name: 'poll_numeric', label: 'Poll numeric', type: 'numeric' },
        { name: 'poll_date', label: 'Poll date', type: 'date' },
      ],
    },
  ];

  var root = document.getElementById('poll-admin');
  if (!root) return;
  var cardEl = document.getElementById('pa-card') || root;
  var pageHeadEl = document.getElementById('pa-page-head');
  var pageFootEl = document.getElementById('pa-page-foot');

  var state = {
    view: 'list', // list | structure | sessions
    user: null,
    polls: [],
    poll: null,
    sections: [],
    questions: [],
    sessions: [],
    busy: false,
    error: null,
    modal: null, // null | 'poll' | 'section' | 'question' | 'session' | 'config' | 'import'
    modalError: null,
    editingPoll: null,
    editingSection: null,
    editingQuestion: null,
    editingSession: null,
    optionDraft: [], // [{ value, label }] linked options while editing a question
    optionsCache: null, // Option entities once loaded
    allTemplates: null, // raw /api/templates rows
    allThesauri: null,
    allRelationTypes: null,
    templateReport: null,
    thesaurusReport: null,
    relationTypeReport: null,
    // Import modal
    importSource: 'sm', // sm | json
    importToken: '',
    importSurveyId: '',
    importApiBase: 'eu', // eu | us | ca
    importJson: '',
    importPreview: null,
    importPreviewOpen: false,
    importProgress: null, // string while creating
    toast: null, // { message, pollSharedId }
  };

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function metaList(entity, name) {
    var m = entity && entity.metadata && entity.metadata[name];
    return Array.isArray(m) ? m : [];
  }

  function metaEntry(entity, name) {
    var m = metaList(entity, name);
    return m.length ? m[0] : null;
  }

  function metaVal(entity, name) {
    var entry = metaEntry(entity, name);
    return entry && entry.value !== undefined ? entry.value : undefined;
  }

  function metaLabel(entity, name) {
    var entry = metaEntry(entity, name);
    if (!entry) return undefined;
    return entry.label || entry.value;
  }

  function getUser() {
    try {
      var u = window.store.getState().user;
      return u && u.toJS ? u.toJS() : u;
    } catch (e) {
      return null;
    }
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function parseRetryAfterMs(res) {
    var raw = res.headers && res.headers.get ? res.headers.get('Retry-After') : null;
    if (!raw) return null;
    var asNum = Number(raw);
    if (!Number.isNaN(asNum)) return Math.max(0, asNum * 1000);
    var when = Date.parse(raw);
    if (!Number.isNaN(when)) return Math.max(0, when - Date.now());
    return null;
  }

  function shouldRetryStatus(status, bodyText) {
    if (status === 429 || status === 502 || status === 503 || status === 504) return true;
    // Empty/HTML gateway bodies with 5xx
    if (status >= 500 && (!bodyText || /^\s*</.test(bodyText))) return true;
    return false;
  }

  function errorMessageFromResponse(res, data, textBody) {
    var msg = '';
    if (data) {
      if (
        typeof data.error === 'string' &&
        data.error &&
        data.error.toLowerCase() !== 'validation failed' &&
        data.error.toLowerCase() !== 'validation error'
      ) {
        msg = data.error;
      } else if (data.prettyMessage) {
        var pretty = String(data.prettyMessage);
        var lines = pretty
          .split('\n')
          .map(function (l) {
            return l.trim();
          })
          .filter(Boolean);
        msg = lines.length ? lines[lines.length - 1] : pretty;
      } else if (data.error) {
        msg = typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
      } else if (data.message) {
        msg = data.message;
      }
    }
    if (!msg && res.statusText) msg = res.statusText;
    if (!msg) msg = 'Request failed';
    return 'HTTP ' + res.status + ': ' + msg;
  }

  async function api(method, path, body, opts) {
    opts = opts || {};
    var maxAttempts = opts.maxAttempts != null ? opts.maxAttempts : 5;
    var attempt = 0;
    while (true) {
      attempt += 1;
      var fetchOpts = {
        method: method,
        credentials: 'same-origin',
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          Accept: 'application/json',
        },
      };
      if (body !== undefined) {
        fetchOpts.headers['Content-Type'] = 'application/json';
        fetchOpts.body = JSON.stringify(body);
      }
      var res;
      try {
        res = await fetch(path, fetchOpts);
      } catch (netErr) {
        if (attempt >= maxAttempts) {
          throw new Error(netErr.message || String(netErr));
        }
        await sleep(Math.min(30000, 500 * Math.pow(2, attempt - 1)) + Math.random() * 250);
        continue;
      }
      var textBody = await res.text();
      var data;
      try {
        data = textBody ? JSON.parse(textBody) : null;
      } catch (e) {
        data = null;
      }
      if (res.ok) return data;
      var retryable = shouldRetryStatus(res.status, textBody);
      if (!retryable || attempt >= maxAttempts) {
        throw new Error(errorMessageFromResponse(res, data, textBody));
      }
      var wait =
        parseRetryAfterMs(res) ||
        Math.min(30000, 750 * Math.pow(2, attempt - 1)) + Math.random() * 400;
      await sleep(wait);
    }
  }

  /** Tiny gap between bulk writes; retries handle real rate limits. */
  async function apiWrite(method, path, body) {
    var data = await api(method, path, body);
    await sleep(10);
    return data;
  }

  function docsLinkHtml(label) {
    return (
      '<p class="pa-docs-link">' +
      '<a href="' +
      DOCS_URL +
      '" target="_blank" rel="noopener noreferrer">' +
      escapeHtml(label || 'Documentation') +
      '</a></p>'
    );
  }

  function renderShell(html, pageHeadHtml, pageFootHtml) {
    if (pageHeadEl) {
      if (pageHeadHtml) {
        pageHeadEl.innerHTML = pageHeadHtml;
        pageHeadEl.hidden = false;
      } else {
        pageHeadEl.innerHTML = '';
        pageHeadEl.hidden = true;
      }
    }
    if (pageFootEl) {
      if (pageFootHtml) {
        pageFootEl.innerHTML = pageFootHtml;
        pageFootEl.hidden = false;
      } else {
        pageFootEl.innerHTML = '';
        pageFootEl.hidden = true;
      }
    }
    cardEl.innerHTML = html;
    if (state.modal) root.classList.add('pa-has-modal');
    else root.classList.remove('pa-has-modal');
  }

  function setBusy(busy) {
    state.busy = busy;
    var buttons = root.querySelectorAll('button, input, select, textarea');
    for (var i = 0; i < buttons.length; i++) {
      if (buttons[i].dataset.keepEnabled) continue;
      buttons[i].disabled = busy;
    }
  }

  function showError(msg) {
    state.error = msg || null;
  }

  function errorHtml() {
    return state.error
      ? '<p class="pa-error" id="pa-err">' + escapeHtml(state.error) + '</p>'
      : '<p class="pa-error" id="pa-err" hidden></p>';
  }

  function toastHtml() {
    if (!state.toast) return '';
    var t = state.toast;
    var html = '<div class="pa-toast" role="status">';
    html += '<span>' + escapeHtml(t.message || 'Done.') + '</span>';
    if (t.pollSharedId) {
      html +=
        ' <button type="button" class="pa-link" id="pa-toast-structure" data-id="' +
        escapeHtml(t.pollSharedId) +
        '">Open structure</button>';
    }
    html +=
      ' <button type="button" class="pa-btn" id="pa-toast-dismiss">Dismiss</button>';
    html += '</div>';
    return html;
  }

  function statusPill(poll) {
    var lab = String(metaLabel(poll, 'poll_status') || 'draft').toLowerCase();
    var cls = 'pa-pill';
    if (lab === 'published') cls += ' published';
    else if (lab === 'closed') cls += ' closed';
    else cls += ' draft';
    return '<span class="' + cls + '">' + escapeHtml(lab) + '</span>';
  }

  function qTypeLabel(q) {
    var lab = metaLabel(q, 'poll_type');
    if (lab) return String(lab);
    var id = metaVal(q, 'poll_type');
    for (var k in CONFIG.qType) if (CONFIG.qType[k] === id) return k;
    return '—';
  }

  function shortText(q) {
    var t = metaVal(q, 'poll_question_text') || q.title || '';
    var line = String(t)
      .split('\n')
      .map(function (s) {
        return s.trim();
      })
      .filter(Boolean)[0] || 'Untitled';
    return line.length > 90 ? line.slice(0, 87) + '...' : line;
  }

  function searchByTemplate(templateId) {
    var url =
      '/api/search?types=' +
      encodeURIComponent(JSON.stringify([templateId])) +
      '&includeUnpublished=true&limit=3000';
    return api('GET', url).then(function (data) {
      return data.rows || [];
    });
  }

  function loadEntity(sharedId) {
    return api('GET', '/api/entities?sharedId=' + encodeURIComponent(sharedId)).then(function (
      data
    ) {
      var rows = data.rows || (Array.isArray(data) ? data : [data]);
      return rows[0];
    });
  }

  async function loadPolls() {
    state.polls = await searchByTemplate(CONFIG.templates.Poll);
    state.polls.sort(function (a, b) {
      return String(a.title || '').localeCompare(String(b.title || ''));
    });
  }

  async function loadStructure(pollSharedId) {
    var sections = (await searchByTemplate(CONFIG.templates.Section)).filter(function (s) {
      return metaVal(s, 'poll_poll') === pollSharedId;
    });
    sections.sort(function (a, b) {
      return (metaVal(a, 'poll_number') || 0) - (metaVal(b, 'poll_number') || 0);
    });
    var questions = (await searchByTemplate(CONFIG.templates.Question)).filter(function (q) {
      return metaVal(q, 'poll_poll') === pollSharedId;
    });
    questions.sort(function (a, b) {
      var sa = metaVal(a, 'poll_section') || '';
      var sb = metaVal(b, 'poll_section') || '';
      if (sa !== sb) return String(sa).localeCompare(String(sb));
      return (metaVal(a, 'poll_number') || 0) - (metaVal(b, 'poll_number') || 0);
    });
    state.sections = sections;
    state.questions = questions;
  }

  function questionsForSection(sectionSharedId) {
    return state.questions.filter(function (q) {
      return metaVal(q, 'poll_section') === sectionSharedId;
    });
  }

  function templatesOk() {
    if (!state.templateReport) return !!(CONFIG.templates.Poll && CONFIG.templates.Session);
    return state.templateReport.every(function (r) {
      return r.status === 'ok';
    });
  }

  function generateToken() {
    var bytes = new Uint8Array(24);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(bytes);
    } else {
      for (var i = 0; i < bytes.length; i++) bytes[i] = (Math.random() * 256) | 0;
    }
    var s = '';
    for (var j = 0; j < bytes.length; j++) s += ('0' + bytes[j].toString(16)).slice(-2);
    return s;
  }

  function currentLangPrefix() {
    var m = (window.location.pathname || '').match(/^\/([a-z]{2})(?:\/|$)/i);
    return m ? '/' + m[1].toLowerCase() : '/en';
  }

  /** Resolve player Page path for this host (OMCT vs local have different sharedIds). */
  async function resolvePlayerPage() {
    var pages = await api('GET', '/api/pages');
    var rows = Array.isArray(pages) ? pages : pages.rows || [];
    var player = rows.find(function (p) {
      var t = p.title || (p.locales && p.locales.en && p.locales.en.title) || '';
      return String(t).trim() === 'Poll player';
    });
    if (!player || !player.sharedId) {
      throw new Error(
        'Could not find a Page titled "Poll player". Publish the player page on this instance first.'
      );
    }
    CONFIG.playerPage =
      currentLangPrefix() + '/page/' + player.sharedId + '/poll-player';
  }

  function sessionPlayerUrl(pollSharedId, token) {
    if (!CONFIG.playerPage) {
      throw new Error('Player page path not resolved yet.');
    }
    return (
      CONFIG.playerPage +
      '?poll=' +
      encodeURIComponent(pollSharedId) +
      '&token=' +
      encodeURIComponent(token)
    );
  }

  function sessionStatusLabel(session) {
    var id = metaVal(session, 'poll_session_status');
    if (id === CONFIG.sessionStatus.accepted) return 'accepted';
    if (id === CONFIG.sessionStatus.in_progress) return 'in_progress';
    return metaLabel(session, 'poll_session_status') || '—';
  }

  /** Format entity creationDate (ms) or date metadata (unix seconds) for the sessions table. */
  function formatSessionDate(raw) {
    if (raw === undefined || raw === null || raw === '') return '—';
    var n = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(n) || n <= 0) return '—';
    // Uwazi date properties are seconds; entity creationDate/editDate are ms.
    if (n < 1e12) n = n * 1000;
    var d = new Date(n);
    if (Number.isNaN(d.getTime())) return '—';
    try {
      return d.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (err) {
      return d.toISOString().slice(0, 16).replace('T', ' ');
    }
  }

  function nameEq(a, b) {
    return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
  }

  function findByName(rows, name) {
    return (rows || []).find(function (row) {
      return nameEq(row.name, name);
    });
  }

  function findThesaurusValueByLabel(thesaurus, label) {
    var values = (thesaurus && thesaurus.values) || [];
    for (var i = 0; i < values.length; i++) {
      var v = values[i];
      if (nameEq(v.label, label)) return v;
      if (v.values) {
        for (var j = 0; j < v.values.length; j++) {
          if (nameEq(v.values[j].label, label)) return v.values[j];
        }
      }
    }
    return null;
  }

  async function loadAllTemplates() {
    var data = await api('GET', '/api/templates');
    state.allTemplates = data.rows || [];
    return state.allTemplates;
  }

  async function loadAllThesauri() {
    var data = await api('GET', '/api/thesauris');
    state.allThesauri = data.rows || data || [];
    return state.allThesauri;
  }

  async function loadAllRelationTypes() {
    var data = await api('GET', '/api/relationtypes');
    state.allRelationTypes = data.rows || data || [];
    return state.allRelationTypes;
  }

  function syncConfigIdsFromNames() {
    EXPECTED_RELATION_TYPES.forEach(function (spec) {
      var found = findByName(state.allRelationTypes, spec.name);
      if (found && found._id) CONFIG.relationTypes[spec.key] = found._id;
    });
    EXPECTED_THESAURI.forEach(function (spec) {
      var found = findByName(state.allThesauri, spec.name);
      if (!found || !found._id) return;
      CONFIG.thesauri[spec.key] = found._id;
      if (!CONFIG[spec.valuesKey]) CONFIG[spec.valuesKey] = {};
      spec.values.forEach(function (want) {
        var val = findThesaurusValueByLabel(found, want.label);
        if (val && val.id) CONFIG[spec.valuesKey][want.key] = val.id;
      });
    });
    EXPECTED_TEMPLATES.forEach(function (spec) {
      var found = findByName(state.allTemplates, spec.name);
      if (found && found._id) CONFIG.templates[spec.key] = found._id;
    });
  }

  async function loadConfigDeps() {
    await loadAllTemplates();
    await loadAllThesauri();
    await loadAllRelationTypes();
    syncConfigIdsFromNames();
  }

  function findTemplateByName(name) {
    return findByName(state.allTemplates, name);
  }

  function expectedThesaurusId(want) {
    return want.thesaurus && CONFIG.thesauri[want.thesaurus]
      ? CONFIG.thesauri[want.thesaurus]
      : null;
  }

  function expectedThesaurusName(want) {
    var spec = EXPECTED_THESAURI.find(function (t) {
      return t.key === want.thesaurus;
    });
    return spec ? spec.name : want.thesaurus;
  }

  function expectedContentId(want) {
    return want.contentKey && CONFIG.templates[want.contentKey]
      ? CONFIG.templates[want.contentKey]
      : null;
  }

  function expectedRelationTypeId(want) {
    return want.relationTypeKey && CONFIG.relationTypes[want.relationTypeKey]
      ? CONFIG.relationTypes[want.relationTypeKey]
      : null;
  }

  function expectedRelationTypeName(want) {
    var spec = EXPECTED_RELATION_TYPES.find(function (r) {
      return r.key === want.relationTypeKey;
    });
    return spec ? spec.name : want.relationTypeKey;
  }

  function evaluatePropertyConfig(want, have) {
    var notes = [];
    var fixable = false;
    if (want.type === 'select') {
      var wantTh = expectedThesaurusId(want);
      var thName = expectedThesaurusName(want);
      if (want.thesaurus) {
        if (!wantTh) {
          notes.push('thesaurus "' + thName + '" missing');
          fixable = true;
        } else if (!have.content) {
          notes.push('thesaurus not set (expected "' + thName + '")');
          fixable = true;
        } else if (String(have.content) !== String(wantTh)) {
          notes.push('thesaurus wrong (expected "' + thName + '")');
          fixable = true;
        } else {
          notes.push('thesaurus "' + thName + '"');
        }
      }
    }
    if (want.type === 'relationship') {
      var wantContent = expectedContentId(want);
      var wantRel = expectedRelationTypeId(want);
      var relName = expectedRelationTypeName(want);
      if (want.contentKey) {
        if (!wantContent) {
          notes.push('target template "' + want.contentKey + '" missing');
          fixable = true;
        } else if (!have.content) {
          notes.push('target template not set (expected "' + want.contentKey + '")');
          fixable = true;
        } else if (String(have.content) !== String(wantContent)) {
          notes.push('target template wrong (expected "' + want.contentKey + '")');
          fixable = true;
        } else {
          notes.push('target "' + want.contentKey + '"');
        }
      }
      if (want.relationTypeKey) {
        if (!wantRel) {
          notes.push('relation type "' + relName + '" missing');
          fixable = true;
        } else if (!have.relationType) {
          notes.push('relation type not set (expected "' + relName + '")');
          fixable = true;
        } else if (String(have.relationType) !== String(wantRel)) {
          notes.push('relation type wrong (expected "' + relName + '")');
          fixable = true;
        } else {
          notes.push('rel "' + relName + '"');
        }
      }
    }
    var wantFilter = !!want.filter;
    var haveFilter = !!have.filter;
    if (wantFilter !== haveFilter) {
      notes.push(wantFilter ? 'not set as filter' : 'unexpectedly set as filter');
      fixable = true;
    } else if (wantFilter) {
      notes.push('use as filter');
    }
    return { notes: notes, fixable: fixable };
  }

  function buildRelationTypeReport() {
    var report = EXPECTED_RELATION_TYPES.map(function (spec) {
      var found = findByName(state.allRelationTypes, spec.name);
      return {
        key: spec.key,
        name: spec.name,
        status: found ? 'ok' : 'missing',
        found: found || null,
        notes: found ? [] : ['Relationship type not found'],
      };
    });
    state.relationTypeReport = report;
    return report;
  }

  function buildThesaurusReport() {
    var report = EXPECTED_THESAURI.map(function (spec) {
      var found = findByName(state.allThesauri, spec.name);
      if (!found) {
        return {
          key: spec.key,
          name: spec.name,
          status: 'missing',
          thesaurus: null,
          missingValues: spec.values.slice(),
          valueResults: spec.values.map(function (v) {
            return { key: v.key, label: v.label, status: 'missing' };
          }),
          spec: spec,
        };
      }
      var missingValues = [];
      var valueResults = spec.values.map(function (want) {
        var have = findThesaurusValueByLabel(found, want.label);
        if (!have) {
          missingValues.push(want);
          return { key: want.key, label: want.label, status: 'missing' };
        }
        return { key: want.key, label: want.label, status: 'ok' };
      });
      return {
        key: spec.key,
        name: spec.name,
        status: missingValues.length ? 'invalid' : 'ok',
        thesaurus: found,
        missingValues: missingValues,
        valueResults: valueResults,
        spec: spec,
      };
    });
    state.thesaurusReport = report;
    return report;
  }

  function buildConfigReports() {
    buildRelationTypeReport();
    buildThesaurusReport();
    buildTemplateReport();
  }

  function buildTemplateReport() {
    var report = EXPECTED_TEMPLATES.map(function (spec) {
      var found = findTemplateByName(spec.name);
      if (!found) {
        return {
          key: spec.key,
          name: spec.name,
          status: 'missing',
          template: null,
          issues: ['Template not found'],
          missingProps: spec.properties.slice(),
          fixableProps: [],
          propResults: spec.properties.map(function (want) {
            return {
              name: want.name,
              label: want.label,
              type: want.type,
              status: 'missing',
              notes: [],
            };
          }),
          spec: spec,
        };
      }
      if (CONFIG.templates[spec.key] !== found._id) {
        CONFIG.templates[spec.key] = found._id;
      }
      var props = found.properties || [];
      var byName = {};
      props.forEach(function (p) {
        byName[p.name] = p;
      });
      var issues = [];
      var missingProps = [];
      var fixableProps = [];
      var propResults = [];
      spec.properties.forEach(function (want) {
        var have = byName[want.name];
        if (!have) {
          missingProps.push(want);
          issues.push('Missing property "' + want.label + '" (' + want.name + ')');
          propResults.push({
            name: want.name,
            label: want.label,
            type: want.type,
            status: 'missing',
            notes: [],
          });
          return;
        }
        if (have.type !== want.type) {
          issues.push(
            'Property "' +
              want.name +
              '" type is ' +
              have.type +
              ', expected ' +
              want.type
          );
          propResults.push({
            name: want.name,
            label: want.label,
            type: want.type,
            status: 'type_mismatch',
            actualType: have.type,
            notes: [],
          });
          return;
        }
        var cfg = evaluatePropertyConfig(want, have);
        if (cfg.fixable) {
          fixableProps.push({ want: want, have: have });
          issues.push(
            'Property "' + want.name + '": ' + cfg.notes.filter(function (n) {
              return n.indexOf('wrong') >= 0 || n.indexOf('not set') >= 0;
            }).join('; ')
          );
          propResults.push({
            name: want.name,
            label: want.label,
            type: want.type,
            status: 'config_mismatch',
            notes: cfg.notes,
          });
          return;
        }
        propResults.push({
          name: want.name,
          label: want.label,
          type: want.type,
          status: 'ok',
          notes: cfg.notes,
        });
      });
      return {
        key: spec.key,
        name: spec.name,
        status: issues.length ? 'invalid' : 'ok',
        template: found,
        issues: issues,
        missingProps: missingProps,
        fixableProps: fixableProps,
        propResults: propResults,
        spec: spec,
      };
    });
    state.templateReport = report;
    return report;
  }

  function configIsOk() {
    var tOk =
      state.templateReport &&
      state.templateReport.length &&
      state.templateReport.every(function (r) {
        return r.status === 'ok';
      });
    var thOk =
      state.thesaurusReport &&
      state.thesaurusReport.length &&
      state.thesaurusReport.every(function (r) {
        return r.status === 'ok';
      });
    var rtOk =
      state.relationTypeReport &&
      state.relationTypeReport.length &&
      state.relationTypeReport.every(function (r) {
        return r.status === 'ok';
      });
    return !!(tOk && thOk && rtOk);
  }

  function configNeedsCreate() {
    var needTpl = (state.templateReport || []).some(function (r) {
      return (
        r.status === 'missing' ||
        (r.missingProps && r.missingProps.length) ||
        (r.fixableProps && r.fixableProps.length)
      );
    });
    var needTh = (state.thesaurusReport || []).some(function (r) {
      return r.status === 'missing' || (r.missingValues && r.missingValues.length);
    });
    var needRt = (state.relationTypeReport || []).some(function (r) {
      return r.status === 'missing';
    });
    return needTpl || needTh || needRt;
  }

  function iconCheck() {
    return (
      '<svg class="pa-config-icon" viewBox="0 0 20 20" aria-hidden="true">' +
      '<path fill="currentColor" d="M7.7 14.3L3.5 10.1l1.4-1.4 2.8 2.8 7-7 1.4 1.4z"/></svg>'
    );
  }

  function iconCross() {
    return (
      '<svg class="pa-config-icon" viewBox="0 0 20 20" aria-hidden="true">' +
      '<path fill="currentColor" d="M5.5 4.1L4.1 5.5 8.6 10l-4.5 4.5 1.4 1.4L10 11.4l4.5 4.5 1.4-1.4L11.4 10l4.5-4.5-1.4-1.4L10 8.6 5.5 4.1z"/></svg>'
    );
  }

  function configButtonHtml() {
    var ok = configIsOk();
    var checked = !!(
      state.templateReport &&
      state.thesaurusReport &&
      state.relationTypeReport
    );
    var cls = 'pa-btn pa-config-btn';
    if (!checked) cls += ' pa-config-unknown';
    else if (ok) cls += ' pa-config-ok';
    else cls += ' pa-config-bad';
    var icon = !checked ? '' : ok ? iconCheck() : iconCross();
    var title = !checked
      ? 'Configuration not checked yet'
      : ok
        ? 'Configuration looks valid'
        : 'Configuration has issues';
    return (
      '<button type="button" class="' +
      cls +
      '" id="pa-config-btn" title="' +
      escapeHtml(title) +
      '">' +
      icon +
      '<span>Configuration</span></button>'
    );
  }

  function commonPropertiesSeed() {
    return [
      {
        label: 'Title',
        name: 'title',
        type: 'text',
        isCommonProperty: true,
        prioritySorting: false,
      },
      {
        label: 'Date added',
        name: 'creationDate',
        type: 'date',
        isCommonProperty: true,
        prioritySorting: false,
      },
      {
        label: 'Date modified',
        name: 'editDate',
        type: 'date',
        isCommonProperty: true,
        prioritySorting: false,
      },
    ];
  }

  /** Uwazi derives property name from label (safeName). Labels must be Poll-prefixed. */
  function propertyPayload(want) {
    var p = {
      label: want.label,
      type: want.type,
      required: false,
      showInCard: false,
      filter: !!want.filter,
    };
    if (want.type === 'select') {
      var th = expectedThesaurusId(want);
      if (th) p.content = th;
    }
    if (want.type === 'relationship') {
      var content = expectedContentId(want);
      var rel = expectedRelationTypeId(want);
      if (content) p.content = content;
      if (rel) p.relationType = rel;
    }
    return p;
  }

  function applyPropertyWiring(existingProp, want) {
    var next = Object.assign({}, existingProp);
    if (want.type === 'select') {
      var th = expectedThesaurusId(want);
      if (th) next.content = th;
    }
    if (want.type === 'relationship') {
      var content = expectedContentId(want);
      var rel = expectedRelationTypeId(want);
      if (content) next.content = content;
      if (rel) next.relationType = rel;
    }
    next.filter = !!want.filter;
    if (!next.filter) {
      next.defaultfilter = false;
    }
    return next;
  }


  /* ---------- views ---------- */

  function renderList() {
    var head =
      '<h1 class="pa-heading">Polls admin</h1>' +
      '<p class="pa-sub">Create and structure polls. Player stays on the separate poll page.</p>';
    var html = '';
    html += '<div class="pa-toolbar">';
    html += '<button type="button" class="pa-btn primary" id="pa-new-poll">New poll</button>';
    html += '<button type="button" class="pa-btn" id="pa-import">Import</button>';
    html += configButtonHtml();
    html += '<span class="spacer"></span>';
    html += '<button type="button" class="pa-btn" id="pa-refresh">Refresh</button>';
    html += '</div>';
    html += errorHtml();
    html += toastHtml();

    if (!state.polls.length) {
      html += '<p class="pa-muted">No polls yet. Create one to get started.</p>';
    } else {
      html +=
        '<table class="pa-table"><thead><tr><th>Title</th><th>Status</th><th>Id</th><th></th></tr></thead><tbody>';
      state.polls.forEach(function (p) {
        html +=
          '<tr><td><button type="button" class="pa-link pa-open-poll" data-id="' +
          escapeHtml(p.sharedId) +
          '">' +
          escapeHtml(p.title || '(untitled)') +
          '</button></td><td>' +
          statusPill(p) +
          '</td><td><code>' +
          escapeHtml(p.sharedId) +
          '</code></td><td class="pa-row-actions">' +
          '<button type="button" class="pa-btn pa-structure" data-id="' +
          escapeHtml(p.sharedId) +
          '">Structure</button> ' +
          '<button type="button" class="pa-btn pa-sessions" data-id="' +
          escapeHtml(p.sharedId) +
          '">Sessions</button> ' +
          '<button type="button" class="pa-btn pa-export" data-id="' +
          escapeHtml(p.sharedId) +
          '">Export</button></td></tr>';
      });
      html += '</tbody></table>';
    }
    html = appendActiveModal(html);
    // Docs sit outside the card, right-aligned (see #pa-page-foot).
    renderShell(html, head, docsLinkHtml('Documentation'));
    bindList();
    bindActiveModal();
  }

  function bindList() {
    var neu = document.getElementById('pa-new-poll');
    if (neu)
      neu.addEventListener('click', function () {
        state.editingPoll = { _new: true };
        state.modal = 'poll';
        state.modalError = null;
        state.error = null;
        renderList();
      });
    var ref = document.getElementById('pa-refresh');
    if (ref)
      ref.addEventListener('click', function () {
        bootList();
      });
    var imp = document.getElementById('pa-import');
    if (imp)
      imp.addEventListener('click', function () {
        state.modal = 'import';
        state.modalError = null;
        state.importPreview = null;
        state.importPreviewOpen = false;
        state.importProgress = null;
        state.error = null;
        renderList();
      });
    var toastGo = document.getElementById('pa-toast-structure');
    if (toastGo)
      toastGo.addEventListener('click', async function () {
        var id = toastGo.getAttribute('data-id');
        state.toast = null;
        if (id) await openPoll(id, 'structure');
      });
    var toastDismiss = document.getElementById('pa-toast-dismiss');
    if (toastDismiss)
      toastDismiss.addEventListener('click', function () {
        state.toast = null;
        renderList();
      });
    var cfg = document.getElementById('pa-config-btn');
    if (cfg)
      cfg.addEventListener('click', async function () {
        setBusy(true);
        try {
          await loadConfigDeps();
          buildConfigReports();
          state.modal = 'config';
          state.modalError = null;
          renderList();
        } catch (e) {
          state.error = e.message || String(e);
          renderList();
        } finally {
          setBusy(false);
        }
      });
    var opens = cardEl.querySelectorAll('.pa-open-poll');
    for (var i = 0; i < opens.length; i++) {
      opens[i].addEventListener('click', function (ev) {
        openPollSettings(ev.currentTarget.getAttribute('data-id'));
      });
    }
    var structs = cardEl.querySelectorAll('.pa-structure');
    for (var j = 0; j < structs.length; j++) {
      structs[j].addEventListener('click', function (ev) {
        openPoll(ev.currentTarget.getAttribute('data-id'), 'structure');
      });
    }
    var sess = cardEl.querySelectorAll('.pa-sessions');
    for (var s = 0; s < sess.length; s++) {
      sess[s].addEventListener('click', function (ev) {
        openPoll(ev.currentTarget.getAttribute('data-id'), 'sessions');
      });
    }
    var exp = cardEl.querySelectorAll('.pa-export');
    for (var e = 0; e < exp.length; e++) {
      exp[e].addEventListener('click', function (ev) {
        exportPollAsSmJson(ev.currentTarget.getAttribute('data-id'));
      });
    }
  }

  function clearDragMarks() {
    var marked = cardEl.querySelectorAll('.pa-drag-over');
    for (var m = 0; m < marked.length; m++) marked[m].classList.remove('pa-drag-over');
  }

  function closeModal() {
    state.modal = null;
    state.modalError = null;
    state.editingPoll = null;
    state.editingSection = null;
    state.editingQuestion = null;
    state.editingSession = null;
    state.optionDraft = [];
  }

  function optionLabelOf(entityOrMeta) {
    if (!entityOrMeta) return '';
    if (entityOrMeta.label && !entityOrMeta.metadata) {
      return String(entityOrMeta.label || entityOrMeta.value || '');
    }
    return String(
      metaVal(entityOrMeta, 'poll_label') || entityOrMeta.title || entityOrMeta.value || ''
    );
  }

  async function ensureOptionsCache() {
    if (state.optionsCache) return state.optionsCache;
    var rows = await searchByTemplate(CONFIG.templates.Option);
    rows.sort(function (a, b) {
      return optionLabelOf(a).localeCompare(optionLabelOf(b));
    });
    state.optionsCache = rows;
    return rows;
  }

  function typeNeedsOptions(typeId) {
    return (
      typeId === CONFIG.qType.choice || typeId === CONFIG.qType.choice_and_text
    );
  }

  function typeNeedsMulti(typeId) {
    return (
      typeId === CONFIG.qType.choice || typeId === CONFIG.qType.choice_and_text
    );
  }

  function typeNeedsPrompt(typeId) {
    return (
      typeId === CONFIG.qType.choice_and_text || typeId === CONFIG.qType.free_text
    );
  }

  /** 1-based ordinal across the whole poll (sections in order, then question number). */
  function pollQuestionOrdinal(sharedId, sectionIdForNew, isNew) {
    var ordered = [];
    state.sections.forEach(function (sec) {
      questionsForSection(sec.sharedId).forEach(function (qq) {
        ordered.push(qq);
      });
    });
    if (isNew) return ordered.length + 1;
    var idx = ordered.findIndex(function (qq) {
      return qq.sharedId === sharedId;
    });
    return idx >= 0 ? idx + 1 : ordered.length;
  }

  function initOptionDraftFromQuestion(q) {
    if (!q || q._new) {
      state.optionDraft = [];
      return;
    }
    state.optionDraft = metaList(q, 'poll_available_options').map(function (o) {
      return { value: o.value, label: o.label || o.value };
    });
  }

  function appendActiveModal(html) {
    if (state.modal === 'poll') html += renderPollModalHtml();
    if (state.modal === 'section') html += renderSectionModalHtml();
    if (state.modal === 'question') html += renderQuestionModalHtml();
    if (state.modal === 'session') html += renderSessionModalHtml();
    if (state.modal === 'config') html += renderConfigModalHtml();
    if (state.modal === 'import') html += renderImportModalHtml();
    return html;
  }

  function bindActiveModal() {
    if (state.modal === 'poll') bindPollModal();
    if (state.modal === 'section') bindSectionModal();
    if (state.modal === 'question') bindQuestionModal();
    if (state.modal === 'session') bindSessionModal();
    if (state.modal === 'config') bindConfigModal();
    if (state.modal === 'import') bindImportModal();
  }

  function modalErrorHtml() {
    return state.modalError
      ? '<p class="pa-error">' + escapeHtml(state.modalError) + '</p>'
      : '';
  }

  function renderStructure() {
    var p = state.poll;
    var head =
      '<h1 class="pa-heading">Structure — ' +
      escapeHtml(p.title || '') +
      '</h1>' +
      '<p class="pa-sub">Drag sections to reorder. Drag questions within or across sections (drop on a row to swap/move). Numbers update automatically.</p>';
    var html = '';
    html += '<div class="pa-toolbar">';
    html += '<button type="button" class="pa-btn" id="pa-back">Back to list</button>';
    html += '<button type="button" class="pa-btn" id="pa-edit-poll">Poll settings</button>';
    html += '<button type="button" class="pa-btn primary" id="pa-add-section">Add section</button>';
    html += '</div>';
    html += errorHtml();

    if (!state.sections.length) {
      html += '<p class="pa-muted">No sections yet.</p>';
    } else {
      html += '<div class="pa-sections" id="pa-sections">';
      state.sections.forEach(function (sec, sIdx) {
        var qs = questionsForSection(sec.sharedId);
        html +=
          '<section class="pa-section-block" data-id="' + escapeHtml(sec.sharedId) + '">';
        html += '<div class="pa-section-head">';
        html +=
          '<span class="pa-drag pa-sec-drag" title="Drag to reorder section" aria-hidden="true">⋮⋮</span>';
        html +=
          '<button type="button" class="pa-link pa-edit-sec" data-id="' +
          escapeHtml(sec.sharedId) +
          '">Section ' +
          escapeHtml(metaVal(sec, 'poll_number') || sIdx + 1) +
          ' — ' +
          escapeHtml(sec.title || '') +
          '</button>';
        html +=
          '<button type="button" class="pa-btn pa-add-q" data-section="' +
          escapeHtml(sec.sharedId) +
          '">Add question</button>';
        html +=
          '<button type="button" class="pa-btn pa-add-guide" data-section="' +
          escapeHtml(sec.sharedId) +
          '">Add instructions</button>';
        html +=
          '<button type="button" class="pa-btn pa-btn-danger pa-del-sec" data-id="' +
          escapeHtml(sec.sharedId) +
          '" title="Delete section and its questions">Delete</button>';
        html += '</div>';
        html +=
          '<ul class="pa-qlist" data-section="' + escapeHtml(sec.sharedId) + '">';
        if (!qs.length) {
          html +=
            '<li class="pa-qdrop-empty" data-empty="1">Drop questions here</li>';
        } else {
          qs.forEach(function (q) {
            var typ = qTypeLabel(q);
            html +=
              '<li class="pa-qitem" data-id="' + escapeHtml(q.sharedId) + '">';
            html +=
              '<span class="pa-drag" title="Drag to reorder / move" aria-hidden="true">⋮⋮</span>';
            html +=
              '<span class="pa-qmeta">' +
              (typ === 'instructions' || typ === 'Section / instructions'
                ? 'Info'
                : 'Q' + (metaVal(q, 'poll_number') || '')) +
              '</span>';
            html +=
              '<button type="button" class="pa-link pa-qlabel pa-edit-q" data-id="' +
              escapeHtml(q.sharedId) +
              '">' +
              escapeHtml(shortText(q)) +
              '</button>';
            html += '<span class="pa-qtype">' + escapeHtml(typ) + '</span>';
            html +=
              '<button type="button" class="pa-btn pa-btn-danger pa-del-q" data-id="' +
              escapeHtml(q.sharedId) +
              '" title="Delete this item">Delete</button>';
            html += '</li>';
          });
        }
        html += '</ul></section>';
      });
      html += '</div>';
    }

    html = appendActiveModal(html);

    renderShell(html, head);
    bindStructure();
    bindActiveModal();
  }

  function bindStructure() {
    document.getElementById('pa-back').addEventListener('click', function () {
      closeModal();
      state.view = 'list';
      bootList();
    });
    document.getElementById('pa-edit-poll').addEventListener('click', function () {
      state.editingPoll = state.poll;
      state.modal = 'poll';
      state.modalError = null;
      renderStructure();
    });
    document.getElementById('pa-add-section').addEventListener('click', function () {
      state.editingSection = { _new: true };
      state.modal = 'section';
      state.modalError = null;
      renderStructure();
    });

    var editSecs = cardEl.querySelectorAll('.pa-edit-sec');
    for (var s = 0; s < editSecs.length; s++) {
      editSecs[s].addEventListener('click', function (ev) {
        var id = ev.currentTarget.getAttribute('data-id');
        var sec = state.sections.find(function (x) {
          return x.sharedId === id;
        });
        if (!sec) return;
        state.editingSection = sec;
        state.modal = 'section';
        state.modalError = null;
        renderStructure();
      });
    }

    var addQs = cardEl.querySelectorAll('.pa-add-q');
    for (var i = 0; i < addQs.length; i++) {
      addQs[i].addEventListener('click', function (ev) {
        openNewQuestion(ev.currentTarget.getAttribute('data-section'), false);
      });
    }
    var addGs = cardEl.querySelectorAll('.pa-add-guide');
    for (var g = 0; g < addGs.length; g++) {
      addGs[g].addEventListener('click', function (ev) {
        openNewQuestion(ev.currentTarget.getAttribute('data-section'), true);
      });
    }
    var edits = cardEl.querySelectorAll('.pa-edit-q');
    for (var e = 0; e < edits.length; e++) {
      edits[e].addEventListener('click', function (ev) {
        var id = ev.currentTarget.getAttribute('data-id');
        var q = state.questions.find(function (x) {
          return x.sharedId === id;
        });
        if (!q) return;
        state.editingQuestion = q;
        initOptionDraftFromQuestion(q);
        state.modal = 'question';
        state.modalError = null;
        renderStructure();
      });
    }

    var delQs = cardEl.querySelectorAll('.pa-del-q');
    for (var dq = 0; dq < delQs.length; dq++) {
      delQs[dq].addEventListener('click', async function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        var id = ev.currentTarget.getAttribute('data-id');
        if (!id) return;
        var q = state.questions.find(function (x) {
          return x.sharedId === id;
        });
        var label = q ? shortText(q) : id;
        if (
          !window.confirm(
            'Delete this question or instructions?\n\n"' +
              label +
              '"\n\nRemaining items in the section will be renumbered.'
          )
        ) {
          return;
        }
        await deleteQuestion(id);
      });
    }
    var delSecs = cardEl.querySelectorAll('.pa-del-sec');
    for (var ds = 0; ds < delSecs.length; ds++) {
      delSecs[ds].addEventListener('click', async function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        var id = ev.currentTarget.getAttribute('data-id');
        if (!id) return;
        var sec = state.sections.find(function (x) {
          return x.sharedId === id;
        });
        var qs = questionsForSection(id);
        var title = sec ? sec.title || 'Section' : 'Section';
        if (
          !window.confirm(
            'Delete section "' +
              title +
              '" and its ' +
              qs.length +
              ' question(s)/instructions?\n\nRemaining sections will be renumbered.'
          )
        ) {
          return;
        }
        await deleteSection(id);
      });
    }

    bindSectionsDrag();
    var lists = cardEl.querySelectorAll('.pa-qlist');
    for (var l = 0; l < lists.length; l++) bindQuestionDrag(lists[l]);
  }

  function sectionDragActive() {
    return !!document.querySelector('.pa-section-block.pa-dragging');
  }

  /** Swap two sections in DOM order and persist poll_number. */
  function swapSections(fromId, toId) {
    if (!fromId || !toId || fromId === toId) return;
    var container = document.getElementById('pa-sections');
    if (!container) return;
    var ids = [];
    var nodes = container.querySelectorAll('.pa-section-block');
    for (var n = 0; n < nodes.length; n++) ids.push(nodes[n].getAttribute('data-id'));
    var fromIdx = ids.indexOf(fromId);
    var toIdx = ids.indexOf(toId);
    if (fromIdx < 0 || toIdx < 0) return;
    ids[fromIdx] = toId;
    ids[toIdx] = fromId;
    applySectionsOrder(ids);
  }

  /**
   * Make the handle itself draggable (always). Priming host.draggable on mouseenter
   * failed in practice: leaving the tiny handle mid-gesture cleared draggable before
   * dragstart, so Chrome never started the drag.
   */
  function bindHandleAsDraggable(host, handleSelector, onStart, onEnd) {
    var handle = host.querySelector(handleSelector);
    if (!handle) return;
    handle.setAttribute('draggable', 'true');
    handle.addEventListener('dragstart', function (ev) {
      host.classList.add('pa-dragging');
      ev.dataTransfer.effectAllowed = 'move';
      onStart(ev);
      try {
        ev.dataTransfer.setDragImage(host, 16, 16);
      } catch (err) {
        /* ignore — not all browsers support setDragImage */
      }
    });
    handle.addEventListener('dragend', function () {
      host.classList.remove('pa-dragging');
      host.draggable = false;
      clearDragMarks();
      if (onEnd) onEnd();
    });
  }

  function bindSectionsDrag() {
    var container = document.getElementById('pa-sections');
    if (!container) return;
    var blocks = container.querySelectorAll('.pa-section-block');
    for (var i = 0; i < blocks.length; i++) {
      (function (block) {
        bindHandleAsDraggable(block, '.pa-sec-drag', function (ev) {
          ev.dataTransfer.setData(
            'text/plain',
            'sec:' + block.getAttribute('data-id')
          );
        });
        block.addEventListener('dragover', function (ev) {
          if (!sectionDragActive()) return;
          ev.preventDefault();
          ev.dataTransfer.dropEffect = 'move';
          clearDragMarks();
          block.classList.add('pa-drag-over');
        });
        block.addEventListener('drop', function (ev) {
          ev.preventDefault();
          var raw = ev.dataTransfer.getData('text/plain') || '';
          clearDragMarks();
          if (raw.indexOf('sec:') !== 0) return;
          swapSections(raw.slice(4), block.getAttribute('data-id'));
        });
      })(blocks[i]);
    }
  }

  function bindQuestionDrag(ul) {
    var sectionId = ul.getAttribute('data-section');

    ul.addEventListener('dragover', function (ev) {
      if (sectionDragActive()) {
        // Allow dropping a section onto the question list area.
        ev.preventDefault();
        ev.dataTransfer.dropEffect = 'move';
        clearDragMarks();
        var block = ul.closest('.pa-section-block');
        if (block) block.classList.add('pa-drag-over');
        return;
      }
      ev.preventDefault();
      ev.dataTransfer.dropEffect = 'move';
      clearDragMarks();
      ul.classList.add('pa-drag-over');
    });
    ul.addEventListener('drop', function (ev) {
      if (ev.target.closest && ev.target.closest('.pa-qitem') && !ev.target.closest('[data-empty]')) {
        return; // item handler will take it
      }
      ev.preventDefault();
      var fromId = ev.dataTransfer.getData('text/plain') || '';
      clearDragMarks();
      if (!fromId) return;
      if (fromId.indexOf('sec:') === 0) {
        swapSections(fromId.slice(4), sectionId);
        return;
      }
      handleQuestionDrop(fromId, sectionId, null);
    });

    var items = ul.querySelectorAll('.pa-qitem');
    for (var i = 0; i < items.length; i++) {
      (function (li) {
        bindHandleAsDraggable(li, '.pa-drag', function (ev) {
          ev.dataTransfer.setData('text/plain', li.getAttribute('data-id'));
        });
        li.addEventListener('dragover', function (ev) {
          if (sectionDragActive()) {
            ev.preventDefault();
            ev.dataTransfer.dropEffect = 'move';
            clearDragMarks();
            var block = li.closest('.pa-section-block');
            if (block) block.classList.add('pa-drag-over');
            return;
          }
          ev.preventDefault();
          ev.stopPropagation();
          ev.dataTransfer.dropEffect = 'move';
          clearDragMarks();
          li.classList.add('pa-drag-over');
        });
        li.addEventListener('drop', function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          var fromId = ev.dataTransfer.getData('text/plain') || '';
          var toId = li.getAttribute('data-id');
          clearDragMarks();
          if (!fromId) return;
          // Forward section drops that land on a question row (most of the hit area).
          if (fromId.indexOf('sec:') === 0) {
            swapSections(fromId.slice(4), sectionId);
            return;
          }
          if (fromId === toId) return;
          handleQuestionDrop(fromId, sectionId, toId);
        });
      })(items[i]);
    }
  }

  function handleQuestionDrop(fromId, toSectionId, toId) {
    var fromQ = state.questions.find(function (x) {
      return x.sharedId === fromId;
    });
    if (!fromQ) return;
    var fromSection = metaVal(fromQ, 'poll_section');

    if (fromSection === toSectionId) {
      if (!toId) return;
      var ids = questionsForSection(toSectionId).map(function (q) {
        return q.sharedId;
      });
      var fromIdx = ids.indexOf(fromId);
      var toIdx = ids.indexOf(toId);
      if (fromIdx < 0 || toIdx < 0) return;
      ids[fromIdx] = toId;
      ids[toIdx] = fromId;
      applyQuestionOrder(toSectionId, ids);
      return;
    }

    // Cross-section move: insert at target row (or append if empty list).
    var targetIds = questionsForSection(toSectionId)
      .map(function (q) {
        return q.sharedId;
      })
      .filter(function (id) {
        return id !== fromId;
      });
    var insertAt = toId ? targetIds.indexOf(toId) : targetIds.length;
    if (insertAt < 0) insertAt = targetIds.length;
    targetIds.splice(insertAt, 0, fromId);

    var sourceIds = questionsForSection(fromSection)
      .map(function (q) {
        return q.sharedId;
      })
      .filter(function (id) {
        return id !== fromId;
      });

    applyQuestionMove(fromId, fromSection, sourceIds, toSectionId, targetIds);
  }

  async function applyQuestionOrder(sectionId, orderedIds) {
    setBusy(true);
    try {
      for (var i = 0; i < orderedIds.length; i++) {
        var desired = i + 1;
        var q = state.questions.find(function (x) {
          return x.sharedId === orderedIds[i];
        });
        if (!q) continue;
        if (Number(metaVal(q, 'poll_number')) === desired) continue;
        await saveQuestionPlacement(q, sectionId, desired);
        patchQuestionPlacement(q.sharedId, sectionId, desired);
      }
      sortQuestionsLocal();
      state.error = null;
      renderStructure();
    } catch (err) {
      state.error = err.message || String(err);
      renderStructure();
    } finally {
      setBusy(false);
    }
  }

  async function applyQuestionMove(fromId, fromSection, sourceIds, toSectionId, targetIds) {
    setBusy(true);
    try {
      for (var t = 0; t < targetIds.length; t++) {
        var tq = state.questions.find(function (x) {
          return x.sharedId === targetIds[t];
        });
        if (!tq) continue;
        var tNum = t + 1;
        var needs =
          metaVal(tq, 'poll_section') !== toSectionId || Number(metaVal(tq, 'poll_number')) !== tNum;
        if (!needs) continue;
        await saveQuestionPlacement(tq, toSectionId, tNum);
        patchQuestionPlacement(tq.sharedId, toSectionId, tNum);
      }
      for (var s = 0; s < sourceIds.length; s++) {
        var sq = state.questions.find(function (x) {
          return x.sharedId === sourceIds[s];
        });
        if (!sq) continue;
        var sNum = s + 1;
        if (Number(metaVal(sq, 'poll_number')) === sNum) continue;
        await saveQuestionPlacement(sq, fromSection, sNum);
        patchQuestionPlacement(sq.sharedId, fromSection, sNum);
      }
      sortQuestionsLocal();
      state.error = null;
      renderStructure();
    } catch (err) {
      state.error = err.message || String(err);
      renderStructure();
    } finally {
      setBusy(false);
    }
  }

  async function applySectionsOrder(orderedIds) {
    setBusy(true);
    try {
      for (var i = 0; i < orderedIds.length; i++) {
        var desired = i + 1;
        var sec = state.sections.find(function (x) {
          return x.sharedId === orderedIds[i];
        });
        if (!sec) continue;
        if (Number(metaVal(sec, 'poll_number')) === desired) continue;
        await saveSectionNumber(sec, desired);
        patchSectionNumber(sec.sharedId, desired);
      }
      sortSectionsLocal();
      state.error = null;
      renderStructure();
    } catch (err) {
      state.error = err.message || String(err);
      renderStructure();
    } finally {
      setBusy(false);
    }
  }

  function patchQuestionPlacement(sharedId, sectionId, number) {
    var q = state.questions.find(function (x) {
      return x.sharedId === sharedId;
    });
    if (!q) return;
    if (!q.metadata) q.metadata = {};
    q.metadata.poll_number = [{ value: Number(number) }];
    q.metadata.poll_section = [{ value: sectionId }];
  }

  function patchSectionNumber(sharedId, number) {
    var sec = state.sections.find(function (x) {
      return x.sharedId === sharedId;
    });
    if (!sec) return;
    if (!sec.metadata) sec.metadata = {};
    sec.metadata.poll_number = [{ value: Number(number) }];
  }

  function sortQuestionsLocal() {
    state.questions.sort(function (a, b) {
      var sa = metaVal(a, 'poll_section') || '';
      var sb = metaVal(b, 'poll_section') || '';
      if (sa !== sb) return String(sa).localeCompare(String(sb));
      return (metaVal(a, 'poll_number') || 0) - (metaVal(b, 'poll_number') || 0);
    });
  }

  function sortSectionsLocal() {
    state.sections.sort(function (a, b) {
      return (metaVal(a, 'poll_number') || 0) - (metaVal(b, 'poll_number') || 0);
    });
  }

  async function deleteEntityBySharedId(sharedId) {
    await api('DELETE', '/api/entities?sharedId=' + encodeURIComponent(sharedId));
  }

  async function renumberQuestionsInSection(sectionId) {
    var qs = questionsForSection(sectionId);
    for (var i = 0; i < qs.length; i++) {
      var desired = i + 1;
      if (Number(metaVal(qs[i], 'poll_number')) === desired) continue;
      await saveQuestionPlacement(qs[i], sectionId, desired);
      patchQuestionPlacement(qs[i].sharedId, sectionId, desired);
    }
    sortQuestionsLocal();
  }

  async function renumberSections() {
    sortSectionsLocal();
    for (var i = 0; i < state.sections.length; i++) {
      var desired = i + 1;
      var sec = state.sections[i];
      if (Number(metaVal(sec, 'poll_number')) === desired) continue;
      await saveSectionNumber(sec, desired);
      patchSectionNumber(sec.sharedId, desired);
    }
    sortSectionsLocal();
  }

  async function deleteQuestion(sharedId) {
    var q = state.questions.find(function (x) {
      return x.sharedId === sharedId;
    });
    if (!q) return;
    var sectionId = metaVal(q, 'poll_section');
    setBusy(true);
    try {
      await deleteEntityBySharedId(sharedId);
      state.questions = state.questions.filter(function (x) {
        return x.sharedId !== sharedId;
      });
      if (sectionId) await renumberQuestionsInSection(sectionId);
      state.error = null;
      closeModal();
      renderStructure();
    } catch (e) {
      state.error = e.message || String(e);
      renderStructure();
    } finally {
      setBusy(false);
    }
  }

  async function deleteSection(sharedId) {
    var qs = questionsForSection(sharedId).slice();
    setBusy(true);
    try {
      for (var i = 0; i < qs.length; i++) {
        await deleteEntityBySharedId(qs[i].sharedId);
      }
      await deleteEntityBySharedId(sharedId);
      state.questions = state.questions.filter(function (x) {
        return metaVal(x, 'poll_section') !== sharedId;
      });
      state.sections = state.sections.filter(function (x) {
        return x.sharedId !== sharedId;
      });
      await renumberSections();
      state.error = null;
      closeModal();
      renderStructure();
    } catch (e) {
      state.error = e.message || String(e);
      try {
        await loadStructure(state.poll.sharedId);
      } catch (ignore) {}
      renderStructure();
    } finally {
      setBusy(false);
    }
  }

  async function saveQuestionPlacement(q, sectionId, number) {
    var payload = {
      _id: q._id,
      sharedId: q.sharedId,
      title: q.title,
      template: CONFIG.templates.Question,
      published: false,
      language: 'en',
      metadata: Object.assign({}, buildQuestionMetadataFromEntity(q), {
        poll_number: [{ value: Number(number) }],
        poll_section: [{ value: sectionId }],
      }),
    };
    var saved = await api('POST', '/api/entities', payload);
    return saved.entity || saved;
  }

  async function saveSectionNumber(sec, number) {
    var payload = {
      _id: sec._id,
      sharedId: sec.sharedId,
      title: sec.title,
      template: CONFIG.templates.Section,
      published: false,
      language: 'en',
      metadata: {
        poll_number: [{ value: Number(number) }],
        poll_poll: [{ value: state.poll.sharedId }],
      },
    };
    var desc = metaVal(sec, 'poll_description');
    if (desc) payload.metadata.poll_description = [{ value: desc }];
    var saved = await api('POST', '/api/entities', payload);
    return saved.entity || saved;
  }

  function buildQuestionMetadataFromEntity(q) {
    var md = {};
    ['poll_question_text', 'poll_type', 'poll_allow_multiple', 'poll_text_prompt', 'poll_section', 'poll_poll'].forEach(
      function (key) {
        var list = metaList(q, key);
        if (list.length) md[key] = list.map(function (e) {
          return { value: e.value };
        });
      }
    );
    var opts = metaList(q, 'poll_available_options');
    if (opts.length) {
      md.poll_available_options = opts.map(function (e) {
        return { value: e.value };
      });
    }
    var num = metaVal(q, 'poll_number');
    if (num !== undefined) md.poll_number = [{ value: num }];
    return md;
  }

  function renderPollModalHtml() {
    var p = state.editingPoll;
    var isNew = !!(p && p._new);
    var html = '';
    html += '<div class="pa-modal-backdrop" id="pa-modal-backdrop">';
    html += '<div class="pa-modal" role="dialog" aria-modal="true">';
    html += '<h2>' + (isNew ? 'New poll' : 'Edit poll') + '</h2>';
    html += modalErrorHtml();
    html += '<div class="pa-form">';
    if (!isNew) {
      html +=
        '<p class="pa-muted" style="margin:0"><code>' +
        escapeHtml(p.sharedId) +
        '</code></p>';
    }
    html +=
      '<div class="pa-field"><label for="pa-title">Title</label><input id="pa-title" type="text" value="' +
      escapeHtml(isNew ? '' : p.title || '') +
      '" /></div>';
    html +=
      '<div class="pa-field"><label for="pa-desc">Description</label><textarea id="pa-desc">' +
      escapeHtml(isNew ? '' : metaVal(p, 'poll_description') || '') +
      '</textarea></div>';
    if (!isNew) {
      var st = metaVal(p, 'poll_status') || CONFIG.pollStatus.draft;
      html += '<div class="pa-field"><label for="pa-status">Status</label><select id="pa-status">';
      ['draft', 'published', 'closed'].forEach(function (k) {
        html +=
          '<option value="' +
          CONFIG.pollStatus[k] +
          '"' +
          (st === CONFIG.pollStatus[k] ? ' selected' : '') +
          '>' +
          k +
          '</option>';
      });
      html += '</select></div>';
    }
    html += '<div class="pa-actions">';
    html += '<button type="button" class="pa-btn" id="pa-cancel-modal">Cancel</button>';
    if (!isNew && state.view === 'list') {
      html +=
        '<button type="button" class="pa-btn" id="pa-to-structure">Structure</button>';
    }
    html +=
      '<button type="button" class="pa-btn primary" id="pa-save-poll">' +
      (isNew ? 'Create' : 'Save') +
      '</button>';
    html += '</div></div></div></div>';
    return html;
  }

  function bindPollModal() {
    var backdrop = document.getElementById('pa-modal-backdrop');
    document.getElementById('pa-cancel-modal').addEventListener('click', function () {
      closeModal();
      render();
    });
    backdrop.addEventListener('click', function (ev) {
      if (ev.target === backdrop) {
        closeModal();
        render();
      }
    });
    var toStruct = document.getElementById('pa-to-structure');
    if (toStruct) {
      toStruct.addEventListener('click', async function () {
        var id = state.editingPoll && state.editingPoll.sharedId;
        closeModal();
        if (id) await openPoll(id, 'structure');
      });
    }
    document.getElementById('pa-save-poll').addEventListener('click', async function () {
      await savePollModal();
    });
    var titleEl = document.getElementById('pa-title');
    if (titleEl) titleEl.focus();
  }

  async function savePollModal() {
    var p = state.editingPoll;
    var isNew = !!(p && p._new);
    var title = (document.getElementById('pa-title').value || '').trim();
    var desc = (document.getElementById('pa-desc').value || '').trim();
    if (!title) {
      state.modalError = 'Title is required.';
      render();
      return;
    }
    setBusy(true);
    try {
      if (isNew) {
        var saved = await api('POST', '/api/entities', {
          title: title,
          template: CONFIG.templates.Poll,
          published: false,
          language: 'en',
          metadata: {
            poll_description: desc ? [{ value: desc }] : [],
            poll_status: [{ value: CONFIG.pollStatus.draft }],
          },
        });
        var entity = saved.entity || saved;
        closeModal();
        state.error = null;
        await openPoll(entity.sharedId, 'structure');
      } else {
        var statusEl = document.getElementById('pa-status');
        var status = statusEl
          ? statusEl.value
          : metaVal(p, 'poll_status') || CONFIG.pollStatus.draft;
        var updated = await api('POST', '/api/entities', {
          _id: p._id,
          sharedId: p.sharedId,
          title: title,
          template: CONFIG.templates.Poll,
          published: false,
          language: 'en',
          metadata: {
            poll_description: desc ? [{ value: desc }] : [],
            poll_status: [{ value: status }],
          },
        });
        var ent = updated.entity || updated;
        state.poll = ent;
        var idx = state.polls.findIndex(function (x) {
          return x.sharedId === ent.sharedId;
        });
        if (idx >= 0) state.polls[idx] = ent;
        closeModal();
        state.error = null;
        render();
      }
    } catch (e) {
      state.modalError = e.message || String(e);
      render();
    } finally {
      setBusy(false);
    }
  }

  async function openPollSettings(sharedId) {
    setBusy(true);
    state.error = null;
    try {
      var poll = await loadEntity(sharedId);
      if (!poll) throw new Error('Poll not found.');
      state.poll = poll;
      state.editingPoll = poll;
      state.modal = 'poll';
      state.modalError = null;
      state.view = 'list';
      renderList();
    } catch (e) {
      state.error = e.message || String(e);
      state.view = 'list';
      renderList();
    } finally {
      setBusy(false);
    }
  }

  function openNewQuestion(sectionId, asGuidance) {
    state.editingQuestion = {
      _new: true,
      sectionId: sectionId,
      asGuidance: asGuidance,
    };
    state.optionDraft = [];
    state.modal = 'question';
    state.modalError = null;
    renderStructure();
  }

  function renderSectionModalHtml() {
    var sec = state.editingSection;
    var isNew = !!(sec && sec._new);
    var displayNum = isNew
      ? state.sections.length + 1
      : metaVal(sec, 'poll_number') || '';
    var html = '';
    html += '<div class="pa-modal-backdrop" id="pa-modal-backdrop">';
    html += '<div class="pa-modal" role="dialog" aria-modal="true">';
    html += '<h2>' + (isNew ? 'New section' : 'Edit section') + '</h2>';
    html += modalErrorHtml();
    html += '<div class="pa-form">';
    html +=
      '<div class="pa-field"><label for="pa-sectitle">Title</label><input id="pa-sectitle" type="text" value="' +
      escapeHtml(isNew ? '' : sec.title || '') +
      '" /></div>';
    html +=
      '<div class="pa-field"><label for="pa-secnum">Number</label>' +
      '<input id="pa-secnum" type="number" value="' +
      escapeHtml(displayNum) +
      '" disabled />' +
      '<p class="pa-muted" style="margin:0.35rem 0 0">' +
      (isNew
        ? 'New sections are appended at the end. Reorder with drag-and-drop.'
        : 'Change order with drag-and-drop on the structure view.') +
      '</p></div>';
    html += '<div class="pa-actions">';
    html += '<button type="button" class="pa-btn" id="pa-cancel-modal">Cancel</button>';
    html +=
      '<button type="button" class="pa-btn primary" id="pa-save-sec">' +
      (isNew ? 'Create' : 'Save') +
      '</button>';
    html += '</div></div></div></div>';
    return html;
  }

  function bindSectionModal() {
    var backdrop = document.getElementById('pa-modal-backdrop');
    document.getElementById('pa-cancel-modal').addEventListener('click', function () {
      closeModal();
      renderStructure();
    });
    backdrop.addEventListener('click', function (ev) {
      if (ev.target === backdrop) {
        closeModal();
        renderStructure();
      }
    });
    document.getElementById('pa-save-sec').addEventListener('click', async function () {
      await saveSectionModal();
    });
    var titleEl = document.getElementById('pa-sectitle');
    if (titleEl) titleEl.focus();
  }

  async function saveSectionModal() {
    var sec = state.editingSection;
    var isNew = !!(sec && sec._new);
    var title = (document.getElementById('pa-sectitle').value || '').trim();
    if (!title) {
      state.modalError = 'Title is required.';
      renderStructure();
      return;
    }
    setBusy(true);
    try {
      if (isNew) {
        var nextNum = state.sections.length + 1;
        var saved = await api('POST', '/api/entities', {
          title: title,
          template: CONFIG.templates.Section,
          published: false,
          language: 'en',
          metadata: {
            poll_number: [{ value: nextNum }],
            poll_poll: [{ value: state.poll.sharedId }],
          },
        });
        var entity = saved.entity || saved;
        state.sections.push(entity);
        sortSectionsLocal();
      } else {
        var payload = {
          _id: sec._id,
          sharedId: sec.sharedId,
          title: title,
          template: CONFIG.templates.Section,
          published: false,
          language: 'en',
          metadata: {
            poll_number: [{ value: Number(metaVal(sec, 'poll_number') || 1) }],
            poll_poll: [{ value: state.poll.sharedId }],
          },
        };
        var desc = metaVal(sec, 'poll_description');
        if (desc) payload.metadata.poll_description = [{ value: desc }];
        var updated = await api('POST', '/api/entities', payload);
        var ent = updated.entity || updated;
        var idx = state.sections.findIndex(function (x) {
          return x.sharedId === ent.sharedId;
        });
        if (idx >= 0) state.sections[idx] = ent;
        sortSectionsLocal();
      }
      closeModal();
      state.error = null;
      renderStructure();
    } catch (e) {
      state.modalError = e.message || String(e);
      renderStructure();
    } finally {
      setBusy(false);
    }
  }

  function renderQuestionModalHtml() {
    var q = state.editingQuestion;
    var isNew = !!(q && q._new);
    var asGuidance = isNew
      ? !!q.asGuidance
      : qTypeLabel(q) === 'instructions' || metaVal(q, 'poll_type') === CONFIG.qType.instructions;
    var html = '';
    html += '<div class="pa-modal-backdrop" id="pa-modal-backdrop">';
    html += '<div class="pa-modal" role="dialog" aria-modal="true">';
    html +=
      '<h2>' +
      (isNew ? (asGuidance ? 'New instructions' : 'New question') : 'Edit question') +
      '</h2>';
    html += modalErrorHtml();
    html += '<div class="pa-form">';

    var text = isNew ? '' : metaVal(q, 'poll_question_text') || '';
    html +=
      '<div class="pa-field"><label for="pa-qtext">Text</label><textarea id="pa-qtext" class="pa-qtext">' +
      escapeHtml(text) +
      '</textarea></div>';

    var sectionIdForNum = isNew ? q.sectionId : metaVal(q, 'poll_section');
    var siblingsForNum = questionsForSection(sectionIdForNum);
    var sectionNum = isNew
      ? siblingsForNum.length + 1
      : metaVal(q, 'poll_number') !== undefined
        ? metaVal(q, 'poll_number')
        : siblingsForNum.length;
    var pollNum = pollQuestionOrdinal(isNew ? null : q.sharedId, sectionIdForNum, isNew);
    html +=
      '<p class="pa-qnums">' +
      'Number in section <span class="pa-num-badge">' +
      escapeHtml(sectionNum) +
      '</span> in poll <span class="pa-num-badge">' +
      escapeHtml(pollNum) +
      '</span> <span class="pa-muted">(assigned automatically)</span>' +
      '</p>';

    if (!asGuidance) {
      var curType = isNew ? CONFIG.qType.choice : metaVal(q, 'poll_type') || CONFIG.qType.choice;
      html += '<div class="pa-field"><label for="pa-qtype">Type</label><select id="pa-qtype">';
      [
        ['choice', 'Choice'],
        ['choice_and_text', 'Choice + other field'],
        ['free_text', 'Open text'],
        ['numeric', 'Numeric'],
        ['date', 'Date'],
        ['instructions', 'Instructions'],
      ].forEach(function (pair) {
        html +=
          '<option value="' +
          CONFIG.qType[pair[0]] +
          '"' +
          (curType === CONFIG.qType[pair[0]] ? ' selected' : '') +
          '>' +
          pair[1] +
          '</option>';
      });
      html += '</select></div>';

      var multi = !isNew && metaVal(q, 'poll_allow_multiple') === CONFIG.yesNo.yes;
      html +=
        '<div class="pa-field" id="pa-multi-wrap"' +
        (typeNeedsMulti(curType) ? '' : ' hidden') +
        '><label><input id="pa-multi" type="checkbox"' +
        (multi ? ' checked' : '') +
        ' /> Allow multiple selections</label></div>';
      html +=
        '<div class="pa-field" id="pa-prompt-wrap"' +
        (typeNeedsPrompt(curType) ? '' : ' hidden') +
        '><label for="pa-prompt">Text prompt</label><input id="pa-prompt" type="text" value="' +
        escapeHtml(isNew ? '' : metaVal(q, 'poll_text_prompt') || '') +
        '" placeholder="Shown with the free-text / other field" /></div>';
    }

    if (!asGuidance) {
      var initialType = isNew ? CONFIG.qType.choice : metaVal(q, 'poll_type') || CONFIG.qType.choice;
      html +=
        '<div id="pa-opts-wrap"' +
        (typeNeedsOptions(initialType) ? '' : ' hidden') +
        '>' +
        renderOptionsEditorHtml() +
        '</div>';
    }

    html += '<div class="pa-actions">';
    html += '<button type="button" class="pa-btn" id="pa-cancel-modal">Cancel</button>';
    html += '<button type="button" class="pa-btn primary" id="pa-save-q">Save</button>';
    html += '</div></div></div></div>';
    return html;
  }

  function renderOptionsEditorHtml() {
    var html = '';
    html += '<div class="pa-field" id="pa-opts-editor">';
    html +=
      '<label class="pa-opts-heading">Options <span class="pa-muted">(' +
      state.optionDraft.length +
      ' linked)</span></label>';
    html +=
      '<p class="pa-muted pa-opts-hint">Drag to reorder. Reuse existing options or create new ones. Saved with the question.</p>';

    if (!state.optionDraft.length) {
      html += '<p class="pa-muted pa-opts-empty">No options linked yet.</p>';
    } else {
      html += '<ul class="pa-optlist" id="pa-optlist">';
      state.optionDraft.forEach(function (o, idx) {
        html +=
          '<li class="pa-optitem" data-id="' +
          escapeHtml(o.value) +
          '" data-idx="' +
          idx +
          '">' +
          '<span class="pa-drag" title="Drag to reorder" aria-hidden="true">⋮⋮</span>' +
          '<span class="pa-optlabel">' +
          escapeHtml(o.label || o.value) +
          '</span>' +
          '<button type="button" class="pa-btn pa-opt-remove" data-id="' +
          escapeHtml(o.value) +
          '" title="Unlink">Remove</button>' +
          '</li>';
      });
      html += '</ul>';
    }

    html +=
      '<div class="pa-opt-add">' +
      '<input id="pa-opt-search" type="text" placeholder="Search existing options..." autocomplete="off" />' +
      '<div class="pa-opt-results" id="pa-opt-results" hidden></div>' +
      '</div>';
    html +=
      '<div class="pa-opt-create">' +
      '<input id="pa-opt-new" type="text" placeholder="New option label" />' +
      '<button type="button" class="pa-btn" id="pa-opt-create">Create &amp; link</button>' +
      '</div>';
    html += '</div>';
    return html;
  }

  function refreshOptionsEditor() {
    var wrap = document.getElementById('pa-opts-wrap');
    if (!wrap) return;
    wrap.innerHTML = renderOptionsEditorHtml();
    bindOptionsEditor();
  }

  function bindOptionsEditor() {
    var list = document.getElementById('pa-optlist');
    if (list) bindOptionDraftDrag(list);

    var removes = cardEl.querySelectorAll('.pa-opt-remove');
    for (var r = 0; r < removes.length; r++) {
      removes[r].addEventListener('click', function (ev) {
        var id = ev.currentTarget.getAttribute('data-id');
        state.optionDraft = state.optionDraft.filter(function (o) {
          return o.value !== id;
        });
        refreshOptionsEditor();
      });
    }

    var search = document.getElementById('pa-opt-search');
    var results = document.getElementById('pa-opt-results');
    if (search && results) {
      var runSearch = async function () {
        var q = (search.value || '').trim().toLowerCase();
        if (!q) {
          results.hidden = true;
          results.innerHTML = '';
          return;
        }
        try {
          await ensureOptionsCache();
        } catch (e) {
          results.hidden = false;
          results.innerHTML =
            '<p class="pa-error" style="margin:0.35rem">Could not load options.</p>';
          return;
        }
        var linked = {};
        state.optionDraft.forEach(function (o) {
          linked[o.value] = true;
        });
        var matches = state.optionsCache
          .filter(function (row) {
            if (linked[row.sharedId]) return false;
            return optionLabelOf(row).toLowerCase().indexOf(q) !== -1;
          })
          .slice(0, 12);
        if (!matches.length) {
          results.hidden = false;
          results.innerHTML = '<p class="pa-muted" style="margin:0.35rem">No matches.</p>';
          return;
        }
        var html = '<ul class="pa-opt-pick">';
        matches.forEach(function (row) {
          html +=
            '<li><button type="button" class="pa-link pa-opt-pick-btn" data-id="' +
            escapeHtml(row.sharedId) +
            '" data-label="' +
            escapeHtml(optionLabelOf(row)) +
            '">' +
            escapeHtml(optionLabelOf(row)) +
            '</button></li>';
        });
        html += '</ul>';
        results.hidden = false;
        results.innerHTML = html;
        var picks = results.querySelectorAll('.pa-opt-pick-btn');
        for (var i = 0; i < picks.length; i++) {
          picks[i].addEventListener('click', function (ev) {
            var id = ev.currentTarget.getAttribute('data-id');
            var label = ev.currentTarget.getAttribute('data-label');
            state.optionDraft.push({ value: id, label: label });
            search.value = '';
            results.hidden = true;
            results.innerHTML = '';
            refreshOptionsEditor();
          });
        }
      };
      var debounce;
      search.addEventListener('input', function () {
        clearTimeout(debounce);
        debounce = setTimeout(runSearch, 180);
      });
    }

    var createBtn = document.getElementById('pa-opt-create');
    var newInput = document.getElementById('pa-opt-new');
    if (createBtn && newInput) {
      createBtn.addEventListener('click', async function () {
        var label = (newInput.value || '').trim();
        if (!label) return;
        setBusy(true);
        try {
          var saved = await api('POST', '/api/entities', {
            title: label,
            template: CONFIG.templates.Option,
            published: false,
            language: 'en',
            metadata: { poll_label: [{ value: label }] },
          });
          var ent = saved.entity || saved;
          if (state.optionsCache) {
            state.optionsCache.push(ent);
            state.optionsCache.sort(function (a, b) {
              return optionLabelOf(a).localeCompare(optionLabelOf(b));
            });
          }
          state.optionDraft.push({
            value: ent.sharedId,
            label: optionLabelOf(ent) || label,
          });
          newInput.value = '';
          refreshOptionsEditor();
        } catch (e) {
          state.modalError = e.message || String(e);
          renderStructure();
        } finally {
          setBusy(false);
        }
      });
    }
  }

  function bindOptionDraftDrag(ul) {
    var items = ul.querySelectorAll('.pa-optitem');
    for (var i = 0; i < items.length; i++) {
      (function (li) {
        bindHandleAsDraggable(li, '.pa-drag', function (ev) {
          ev.dataTransfer.setData('text/plain', li.getAttribute('data-id'));
        }, function () {
          var marked = ul.querySelectorAll('.pa-drag-over');
          for (var m = 0; m < marked.length; m++) marked[m].classList.remove('pa-drag-over');
        });
        li.addEventListener('dragover', function (ev) {
          ev.preventDefault();
          ev.dataTransfer.dropEffect = 'move';
          var marked = ul.querySelectorAll('.pa-drag-over');
          for (var m = 0; m < marked.length; m++) marked[m].classList.remove('pa-drag-over');
          li.classList.add('pa-drag-over');
        });
        li.addEventListener('drop', function (ev) {
          ev.preventDefault();
          var fromId = ev.dataTransfer.getData('text/plain');
          var toId = li.getAttribute('data-id');
          li.classList.remove('pa-drag-over');
          if (!fromId || fromId === toId) return;
          var fromIdx = -1;
          var toIdx = -1;
          for (var n = 0; n < state.optionDraft.length; n++) {
            if (state.optionDraft[n].value === fromId) fromIdx = n;
            if (state.optionDraft[n].value === toId) toIdx = n;
          }
          if (fromIdx < 0 || toIdx < 0) return;
          var tmp = state.optionDraft[fromIdx];
          state.optionDraft[fromIdx] = state.optionDraft[toIdx];
          state.optionDraft[toIdx] = tmp;
          refreshOptionsEditor();
        });
      })(items[i]);
    }
  }

  function bindQuestionModal() {
    var q = state.editingQuestion;
    var isNew = !!(q && q._new);
    var asGuidance = isNew
      ? !!q.asGuidance
      : qTypeLabel(q) === 'instructions' || metaVal(q, 'poll_type') === CONFIG.qType.instructions;
    var backdrop = document.getElementById('pa-modal-backdrop');
    document.getElementById('pa-cancel-modal').addEventListener('click', function () {
      closeModal();
      renderStructure();
    });
    backdrop.addEventListener('click', function (ev) {
      if (ev.target === backdrop) {
        closeModal();
        renderStructure();
      }
    });
    document.getElementById('pa-save-q').addEventListener('click', async function () {
      await saveQuestionModal(asGuidance);
    });

    var typeSel = document.getElementById('pa-qtype');
    if (typeSel) {
      typeSel.addEventListener('change', function () {
        var tid = typeSel.value;
        var optsWrap = document.getElementById('pa-opts-wrap');
        if (optsWrap) optsWrap.hidden = !typeNeedsOptions(tid);
        var multiWrap = document.getElementById('pa-multi-wrap');
        if (multiWrap) multiWrap.hidden = !typeNeedsMulti(tid);
        var promptWrap = document.getElementById('pa-prompt-wrap');
        if (promptWrap) promptWrap.hidden = !typeNeedsPrompt(tid);
      });
    }

    if (!asGuidance) bindOptionsEditor();

    // Prefetch option catalog in background for snappy search.
    if (!asGuidance) {
      ensureOptionsCache().catch(function () {});
    }

    var textEl = document.getElementById('pa-qtext');
    if (textEl) textEl.focus();
  }

  async function saveQuestionModal(asGuidance) {
    var q = state.editingQuestion;
    var isNew = !!(q && q._new);
    var text = (document.getElementById('pa-qtext').value || '').trim();
    if (!text) {
      state.modalError = 'Text is required.';
      renderStructure();
      return;
    }
    var sectionId = isNew ? q.sectionId : metaVal(q, 'poll_section');
    var siblings = questionsForSection(sectionId);
    var nextNumber = 1;
    siblings.forEach(function (sib) {
      var n = Number(metaVal(sib, 'poll_number') || 0);
      if (n >= nextNumber) nextNumber = n + 1;
    });
    var number = isNew
      ? nextNumber
      : metaVal(q, 'poll_number') !== undefined
        ? Number(metaVal(q, 'poll_number'))
        : nextNumber;
    var typeId = asGuidance
      ? CONFIG.qType.instructions
      : document.getElementById('pa-qtype').value;
    var allowMulti =
      !asGuidance && document.getElementById('pa-multi') && document.getElementById('pa-multi').checked
        ? CONFIG.yesNo.yes
        : CONFIG.yesNo.no;
    var prompt =
      !asGuidance && document.getElementById('pa-prompt')
        ? (document.getElementById('pa-prompt').value || '').trim()
        : '';

    var title =
      (metaVal(
        state.sections.find(function (s) {
          return s.sharedId === sectionId;
        }) || {},
        'poll_number'
      ) || '') +
      '.' +
      number +
      ' ' +
      text.slice(0, 80);

    var metadata = {
      poll_number: [{ value: number }],
      poll_question_text: [{ value: text }],
      poll_type: [{ value: typeId }],
      poll_section: [{ value: sectionId }],
      poll_poll: [{ value: state.poll.sharedId }],
      poll_allow_multiple: [{ value: allowMulti }],
    };
    if (prompt) metadata.poll_text_prompt = [{ value: prompt }];
    if (!asGuidance && typeNeedsOptions(typeId)) {
      metadata.poll_available_options = state.optionDraft.map(function (o) {
        return { value: o.value };
      });
    }

    setBusy(true);
    try {
      var payload = {
        title: title,
        template: CONFIG.templates.Question,
        published: false,
        language: 'en',
        metadata: metadata,
      };
      if (!isNew) {
        payload._id = q._id;
        payload.sharedId = q.sharedId;
      }
      var saved = await api('POST', '/api/entities', payload);
      var entity = saved.entity || saved;
      if (!entity.metadata) entity.metadata = {};
      if (!asGuidance && typeNeedsOptions(typeId)) {
        entity.metadata.poll_available_options = state.optionDraft.map(function (o) {
          return { value: o.value, label: o.label, type: 'entity' };
        });
      }
      if (isNew) {
        state.questions.push(entity);
        sortQuestionsLocal();
      } else {
        var idx = state.questions.findIndex(function (x) {
          return x.sharedId === entity.sharedId;
        });
        if (idx >= 0) state.questions[idx] = entity;
        else state.questions.push(entity);
        sortQuestionsLocal();
      }
      closeModal();
      state.error = null;
      renderStructure();
    } catch (e) {
      state.modalError = e.message || String(e);
      renderStructure();
    } finally {
      setBusy(false);
    }
  }

  async function loadSessions(pollSharedId) {
    var rows = await searchByTemplate(CONFIG.templates.Session);
    state.sessions = rows
      .filter(function (s) {
        return metaVal(s, 'poll_poll') === pollSharedId;
      })
      .sort(function (a, b) {
        return String(a.title || '').localeCompare(String(b.title || ''));
      });
  }

  async function openPoll(sharedId, view) {
    setBusy(true);
    state.error = null;
    try {
      state.poll = await loadEntity(sharedId);
      if (!state.poll) throw new Error('Poll not found.');
      if (view === 'sessions') {
        await loadSessions(sharedId);
        state.view = 'sessions';
      } else {
        await loadStructure(sharedId);
        state.view = view || 'structure';
      }
      render();
    } catch (e) {
      state.error = e.message || String(e);
      state.view = 'list';
      renderList();
    } finally {
      setBusy(false);
    }
  }

  function configStatusPill(status) {
    var statusCls =
      status === 'ok' ? 'published' : status === 'missing' ? 'closed' : 'draft';
    return (
      '<span class="pa-pill ' + statusCls + '">' + escapeHtml(status) + '</span>'
    );
  }

  function renderConfigModalHtml() {
    var tplReport = state.templateReport || [];
    var thReport = state.thesaurusReport || [];
    var rtReport = state.relationTypeReport || [];
    var needsCreate = configNeedsCreate();
    var html = '';
    html += '<div class="pa-modal-backdrop" id="pa-modal-backdrop">';
    html += '<div class="pa-modal pa-modal-wide" role="dialog" aria-modal="true">';
    html += '<h2>Configuration</h2>';
    html += modalErrorHtml();
    html += '<div class="pa-form pa-config-form">';
    html +=
      '<p class="pa-muted" style="margin:0 0 0.65rem">Matched by name/label (not fixed ids). Checks relationship types, thesauri values, templates, and property wiring. Create fills gaps without deleting existing data.</p>';

    html += '<h3 class="pa-config-section">Relationship types</h3>';
    if (!rtReport.length) {
      html += '<p class="pa-error">Could not load relationship types.</p>';
    } else {
      rtReport.forEach(function (row) {
        html += '<div class="pa-config-block">';
        html +=
          '<div class="pa-config-block-head"><strong>' +
          escapeHtml(row.name) +
          '</strong> ' +
          configStatusPill(row.status) +
          '</div></div>';
      });
    }

    html += '<h3 class="pa-config-section">Thesauri</h3>';
    if (!thReport.length) {
      html += '<p class="pa-error">Could not load thesauri.</p>';
    } else {
      thReport.forEach(function (row) {
        html += '<div class="pa-config-block">';
        html +=
          '<div class="pa-config-block-head"><strong>' +
          escapeHtml(row.name) +
          '</strong> ' +
          configStatusPill(row.status) +
          '</div>';
        html += '<ul class="pa-config-props">';
        if (row.status === 'missing') {
          html +=
            '<li><span class="pa-prop-bad">' +
            iconCross() +
            '</span><span>Thesaurus missing</span></li>';
        }
        (row.valueResults || []).forEach(function (vr) {
          var mark =
            vr.status === 'ok'
              ? '<span class="pa-prop-ok">' + iconCheck() + '</span>'
              : '<span class="pa-prop-bad">' + iconCross() + '</span>';
          var detail = escapeHtml(vr.label);
          if (vr.status === 'missing') detail += ' — missing';
          html += '<li>' + mark + '<span>' + detail + '</span></li>';
        });
        html += '</ul></div>';
      });
    }

    html += '<h3 class="pa-config-section">Templates</h3>';
    if (!tplReport.length) {
      html += '<p class="pa-error">Could not load template report.</p>';
    } else {
      tplReport.forEach(function (row) {
        html += '<div class="pa-config-block">';
        html +=
          '<div class="pa-config-block-head"><strong>' +
          escapeHtml(row.name) +
          '</strong> ' +
          configStatusPill(row.status) +
          '</div>';
        html += '<ul class="pa-config-props">';
        (row.propResults || []).forEach(function (pr) {
          var mark =
            pr.status === 'ok'
              ? '<span class="pa-prop-ok">' + iconCheck() + '</span>'
              : '<span class="pa-prop-bad">' + iconCross() + '</span>';
          var detail =
            escapeHtml(pr.label) +
            ' <code>' +
            escapeHtml(pr.name) +
            '</code> · ' +
            escapeHtml(pr.type);
          if (pr.status === 'missing') detail += ' — missing';
          if (pr.status === 'type_mismatch') {
            detail +=
              ' — type is ' +
              escapeHtml(pr.actualType) +
              ', expected ' +
              escapeHtml(pr.type) +
              ' (not auto-fixed)';
          }
          if (pr.status === 'config_mismatch' || (pr.notes && pr.notes.length)) {
            detail += ' — ' + escapeHtml((pr.notes || []).join('; '));
          }
          html += '<li>' + mark + '<span>' + detail + '</span></li>';
        });
        if (row.status === 'missing') {
          html +=
            '<li><span class="pa-prop-bad">' +
            iconCross() +
            '</span><span>Template itself is missing</span></li>';
        }
        html += '</ul></div>';
      });
    }

    html += '<div class="pa-actions">';
    html += '<button type="button" class="pa-btn" id="pa-cancel-modal">Close</button>';
    html +=
      '<button type="button" class="pa-btn" id="pa-config-recheck">Re-check</button>';
    if (needsCreate) {
      html +=
        '<button type="button" class="pa-btn primary" id="pa-config-create">Create the template structure</button>';
    }
    html += '</div></div></div></div>';
    return html;
  }

  function bindConfigModal() {
    var backdrop = document.getElementById('pa-modal-backdrop');
    document.getElementById('pa-cancel-modal').addEventListener('click', function () {
      closeModal();
      renderList();
    });
    backdrop.addEventListener('click', function (ev) {
      if (ev.target === backdrop) {
        closeModal();
        renderList();
      }
    });
    var recheck = document.getElementById('pa-config-recheck');
    if (recheck) {
      recheck.addEventListener('click', async function () {
        setBusy(true);
        try {
          await loadConfigDeps();
          buildConfigReports();
          state.modalError = null;
          renderList();
        } catch (e) {
          state.modalError = e.message || String(e);
          renderList();
        } finally {
          setBusy(false);
        }
      });
    }
    var createBtn = document.getElementById('pa-config-create');
    if (createBtn) {
      createBtn.addEventListener('click', async function () {
        await createTemplateStructure();
      });
    }
  }

  async function ensureRelationTypes() {
    for (var i = 0; i < EXPECTED_RELATION_TYPES.length; i++) {
      await loadAllRelationTypes();
      syncConfigIdsFromNames();
      var spec = EXPECTED_RELATION_TYPES[i];
      if (findByName(state.allRelationTypes, spec.name)) continue;
      var created = await api('POST', '/api/relationtypes', { name: spec.name });
      if (created && created._id) CONFIG.relationTypes[spec.key] = created._id;
    }
  }

  async function ensureThesauri() {
    for (var i = 0; i < EXPECTED_THESAURI.length; i++) {
      await loadAllThesauri();
      syncConfigIdsFromNames();
      var spec = EXPECTED_THESAURI[i];
      var found = findByName(state.allThesauri, spec.name);
      if (!found) {
        var created = await api('POST', '/api/thesauris', {
          name: spec.name,
          values: spec.values.map(function (v) {
            return { label: v.label };
          }),
        });
        if (created && created._id) CONFIG.thesauri[spec.key] = created._id;
        continue;
      }
      var missing = spec.values.filter(function (want) {
        return !findThesaurusValueByLabel(found, want.label);
      });
      if (!missing.length) continue;
      var nextValues = (found.values || []).map(function (v) {
        return Object.assign({}, v);
      });
      missing.forEach(function (want) {
        nextValues.push({ label: want.label });
      });
      await api('POST', '/api/thesauris', {
        _id: found._id,
        name: found.name,
        values: nextValues,
      });
    }
  }

  async function ensureTemplates() {
    for (var i = 0; i < EXPECTED_TEMPLATES.length; i++) {
      await loadAllTemplates();
      syncConfigIdsFromNames();
      buildTemplateReport();
      var spec = EXPECTED_TEMPLATES[i];
      var row = (state.templateReport || []).find(function (r) {
        return r.key === spec.key;
      });
      if (!row) continue;
      if (row.status === 'missing') {
        var props = spec.properties.map(propertyPayload);
        var saved = await api('POST', '/api/templates', {
          name: spec.name,
          color: '#9ca3af',
          commonProperties: commonPropertiesSeed(),
          properties: props,
        });
        var ent = saved || {};
        if (ent._id) {
          CONFIG.templates[spec.key] = ent._id;
        }
        continue;
      }
      var needsMissing = row.missingProps && row.missingProps.length;
      var needsFix = row.fixableProps && row.fixableProps.length;
      if (!needsMissing && !needsFix) continue;
      var tpl = row.template;
      var nextProps = (tpl.properties || []).map(function (p) {
        return Object.assign({}, p);
      });
      if (needsFix) {
        row.fixableProps.forEach(function (fix) {
          var idx = nextProps.findIndex(function (p) {
            return p.name === fix.want.name;
          });
          if (idx >= 0) nextProps[idx] = applyPropertyWiring(nextProps[idx], fix.want);
        });
      }
      if (needsMissing) {
        row.missingProps.forEach(function (want) {
          nextProps.push(propertyPayload(want));
        });
      }
      await api('POST', '/api/templates', {
        _id: tpl._id,
        name: tpl.name,
        color: tpl.color,
        default: tpl.default,
        commonProperties: tpl.commonProperties,
        properties: nextProps,
      });
    }
  }

  async function createTemplateStructure() {
    if (
      !window.confirm(
        'Fill gaps in the poll configuration?\n\n' +
          '• Create missing relationship types (by name)\n' +
          '• Create missing thesauri / values (by label)\n' +
          '• Create missing templates / properties (labels are Poll-prefixed so Uwazi names become poll_*)\n\n' +
          'Existing items stay. Wrong property types are not changed.'
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await ensureRelationTypes();
      await ensureThesauri();
      await loadConfigDeps();
      await ensureTemplates();
      await loadConfigDeps();
      buildConfigReports();
      state.modalError = null;
      state.error = null;
      state.modal = 'config';
      renderList();
    } catch (e) {
      state.modalError = e.message || String(e);
      state.modal = 'config';
      renderList();
    } finally {
      setBusy(false);
    }
  }

  /* ---------- SurveyMonkey import ---------- */

  function smApiBaseUrl() {
    if (state.importApiBase === 'us') return 'https://api.surveymonkey.com';
    if (state.importApiBase === 'ca') return 'https://api.surveymonkey.ca';
    return 'https://api.eu.surveymonkey.com';
  }

  async function smApi(path, token) {
    var res = await fetch(smApiBaseUrl() + path, {
      method: 'GET',
      headers: {
        Authorization: 'Bearer ' + token,
        Accept: 'application/json',
      },
    });
    var textBody = await res.text();
    var data;
    try {
      data = textBody ? JSON.parse(textBody) : null;
    } catch (e) {
      data = null;
    }
    if (!res.ok) {
      var msg =
        (data && data.error && (data.error.message || data.error.name)) ||
        (Array.isArray(data) && data[0] && data[0].message) ||
        res.statusText ||
        'SurveyMonkey request failed';
      if (res.status === 404) msg = 'Survey not found (' + path + '). ' + msg;
      throw new Error(msg);
    }
    return data;
  }

  function requireSmDetails() {
    if (!SM) {
      throw new Error(
        'SurveyMonkey helpers missing (PollSmDetails). Re-publish admin via yarn seed:pages.'
      );
    }
    return SM;
  }

  function buildImportPreviewFromSmDetails(details) {
    return requireSmDetails().buildImportPreviewFromSmDetails(details);
  }

  function buildImportPreviewFromJson(raw) {
    var details = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!details || !details.pages) {
      throw new Error('JSON must be a SurveyMonkey /surveys/{id}/details payload (missing pages).');
    }
    var preview = buildImportPreviewFromSmDetails(details);
    preview.source = 'json';
    return preview;
  }

  function questionKindForExport(q) {
    var typ = qTypeLabel(q);
    if (typ === 'instructions' || typ === 'Section / instructions') return 'instructions';
    if (typ === 'choice' || metaVal(q, 'poll_type') === CONFIG.qType.choice) return 'choice';
    if (typ === 'choice_and_text' || metaVal(q, 'poll_type') === CONFIG.qType.choice_and_text) {
      return 'choice_and_text';
    }
    if (typ === 'numeric' || metaVal(q, 'poll_type') === CONFIG.qType.numeric) return 'numeric';
    if (typ === 'date' || metaVal(q, 'poll_type') === CONFIG.qType.date) return 'date';
    if (typ === 'free_text' || metaVal(q, 'poll_type') === CONFIG.qType.free_text) {
      return 'free_text';
    }
    var id = metaVal(q, 'poll_type');
    for (var k in CONFIG.qType) if (CONFIG.qType[k] === id) return k;
    return 'free_text';
  }

  function downloadJson(filename, obj) {
    var blob = new Blob([JSON.stringify(obj, null, 2)], {
      type: 'application/json',
    });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  async function exportPollAsSmJson(pollSharedId) {
    if (!pollSharedId) return;
    setBusy(true);
    state.error = null;
    try {
      requireSmDetails();
      await loadConfigDeps();
      var poll = await loadEntity(pollSharedId);
      if (!poll) throw new Error('Poll not found.');
      await loadStructure(pollSharedId);
      var sections = (state.sections || []).slice().sort(function (a, b) {
        return (metaVal(a, 'poll_number') || 0) - (metaVal(b, 'poll_number') || 0);
      });
      var payload = {
        title: poll.title,
        sharedId: poll.sharedId,
        sections: sections.map(function (sec) {
          var qs = questionsForSection(sec.sharedId).slice().sort(function (a, b) {
            return (metaVal(a, 'poll_number') || 0) - (metaVal(b, 'poll_number') || 0);
          });
          return {
            sharedId: sec.sharedId,
            title: sec.title,
            questions: qs.map(function (q) {
              var kind = questionKindForExport(q);
              var choices = [];
              if (kind === 'choice' || kind === 'choice_and_text') {
                choices = metaList(q, 'poll_available_options').map(function (o) {
                  return {
                    sharedId: o.value,
                    text: o.label || o.value || '',
                  };
                });
              }
              return {
                sharedId: q.sharedId,
                text: metaVal(q, 'poll_question_text') || q.title || '',
                kind: kind,
                allowMultiple: metaVal(q, 'poll_allow_multiple') === CONFIG.yesNo.yes,
                choices: choices,
              };
            }),
          };
        }),
      };
      var details = SM.exportPollToSmDetails(payload);
      var safeName = String(poll.title || 'poll')
        .replace(/[^a-z0-9]+/gi, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 60);
      downloadJson((safeName || 'poll') + '-sm-details.json', details);
    } catch (err) {
      state.error = err.message || String(err);
      renderList();
    } finally {
      setBusy(false);
    }
  }

  function renderImportModalHtml() {
    var preview = state.importPreview;
    var canCreate =
      !!preview &&
      configIsOk() &&
      !state.importProgress;
    var html = '';
    html += '<div class="pa-modal-backdrop" id="pa-modal-backdrop">';
    html += '<div class="pa-modal pa-modal-wide" role="dialog" aria-modal="true">';
    html += '<h2>Import poll</h2>';
    html += modalErrorHtml();
    if (state.importProgress) {
      html +=
        '<p class="pa-import-status" role="status" aria-live="polite">' +
        escapeHtml(state.importProgress) +
        '</p>';
    }
    html += '<div class="pa-form pa-config-form">';
    html += '<div class="pa-field"><span class="pa-label-like">Source</span>';
    html += '<div class="pa-toggle-row">';
    html +=
      '<label class="pa-radio"><input type="radio" name="pa-import-source" value="sm"' +
      (state.importSource === 'sm' ? ' checked' : '') +
      ' /> SurveyMonkey</label>';
    html +=
      '<label class="pa-radio"><input type="radio" name="pa-import-source" value="json"' +
      (state.importSource === 'json' ? ' checked' : '') +
      ' /> JSON</label>';
    html += '</div></div>';

    if (state.importSource === 'sm') {
      html +=
        '<div class="pa-field"><label for="pa-import-token">Access token</label>' +
        '<input id="pa-import-token" type="text" autocomplete="off" value="' +
        escapeHtml(state.importToken) +
        '" /></div>';
      html +=
        '<div class="pa-field"><label for="pa-import-survey">Survey ID</label>' +
        '<input id="pa-import-survey" type="text" value="' +
        escapeHtml(state.importSurveyId) +
        '" placeholder="e.g. 230569928" />' +
        '<p class="pa-muted" style="margin:0.35rem 0 0">Use the API survey id. Errors from SurveyMonkey are shown as returned.</p></div>';
      html +=
        '<div class="pa-field"><label for="pa-import-base">API base</label><select id="pa-import-base">';
      [
        ['eu', 'EU (api.eu.surveymonkey.com)'],
        ['us', 'US (api.surveymonkey.com)'],
        ['ca', 'CA (api.surveymonkey.ca)'],
      ].forEach(function (pair) {
        html +=
          '<option value="' +
          pair[0] +
          '"' +
          (state.importApiBase === pair[0] ? ' selected' : '') +
          '>' +
          pair[1] +
          '</option>';
      });
      html += '</select></div>';
      var fetching = !!(state.importProgress && /^Fetching/i.test(state.importProgress));
      html +=
        '<div class="pa-field"><button type="button" class="pa-btn primary" id="pa-import-fetch"' +
        (fetching || state.importProgress ? ' disabled' : '') +
        '>' +
        (fetching ? 'Fetching…' : 'Fetch') +
        '</button></div>';
    } else {
      html +=
        '<div class="pa-field"><label for="pa-import-json">SurveyMonkey details JSON</label>' +
        '<textarea id="pa-import-json" class="pa-import-json" rows="10" placeholder="Paste /surveys/{id}/details JSON">' +
        escapeHtml(state.importJson) +
        '</textarea>' +
        docsLinkHtml('Documentation') +
        '</div>';
      html +=
        '<div class="pa-field"><label for="pa-import-file">Or choose file</label>' +
        '<input id="pa-import-file" type="file" accept="application/json,.json" /></div>';
      html +=
        '<div class="pa-field"><button type="button" class="pa-btn primary" id="pa-import-parse">Parse</button></div>';
    }

    if (preview) {
      var st = preview.stats;
      html += '<div class="pa-config-block pa-import-preview">';
      html +=
        '<div class="pa-config-block-head"><strong>Preview</strong> ' +
        configStatusPill('ok') +
        '</div>';
      html +=
        '<p style="margin:0 0 0.35rem"><strong>' +
        escapeHtml(preview.title) +
        '</strong>';
      if (preview.nickname) {
        html +=
          ' <span class="pa-muted">(' + escapeHtml(preview.nickname) + ')</span>';
      }
      html += '</p>';
      html +=
        '<p class="pa-muted" style="margin:0">' +
        st.sections +
        ' sections · ' +
        st.items +
        ' items · choice ' +
        st.choice +
        ' · multi ' +
        st.multi +
        ' · text ' +
        st.text +
        ' · numeric ' +
        st.numeric +
        ' · date ' +
        (st.date || 0) +
        ' · instructions ' +
        st.guidance +
        ' · skipped ' +
        st.skipped +
        '</p>';
      html +=
        '<button type="button" class="pa-link" id="pa-import-toggle-preview" style="margin-top:0.45rem">' +
        (state.importPreviewOpen ? 'Hide section breakdown' : 'Show section breakdown') +
        '</button>';
      if (state.importPreviewOpen) {
        html += '<ul class="pa-config-props" style="margin-top:0.5rem">';
        preview.sections.forEach(function (sec, i) {
          var kept = sec.items.filter(function (it) {
            return !it.skip;
          }).length;
          var skipped = sec.items.length - kept;
          html +=
            '<li><span>' +
            escapeHtml(i + 1 + '. ' + sec.title) +
            ' — ' +
            kept +
            ' items' +
            (skipped ? ' (' + skipped + ' skipped)' : '') +
            '</span></li>';
        });
        html += '</ul>';
      }
      if (preview.warnings && preview.warnings.length) {
        html +=
          '<details style="margin-top:0.55rem"><summary class="pa-muted">' +
          preview.warnings.length +
          ' warning(s)</summary><ul class="pa-config-props">';
        preview.warnings.slice(0, 40).forEach(function (w) {
          html += '<li><span class="pa-prop-bad">' + iconCross() + '</span><span>' + escapeHtml(w) + '</span></li>';
        });
        if (preview.warnings.length > 40) {
          html +=
            '<li><span class="pa-muted">…and ' +
            (preview.warnings.length - 40) +
            ' more</span></li>';
        }
        html += '</ul></details>';
      }
      html += '</div>';
      if (!configIsOk()) {
        html +=
          '<p class="pa-error">Configuration must be valid (green) before creating a poll. Fix templates via Configuration first.</p>';
      }
    }

    html += '<div class="pa-actions">';
    html += '<button type="button" class="pa-btn" id="pa-cancel-modal">Cancel</button>';
    html +=
      '<button type="button" class="pa-btn primary" id="pa-import-create"' +
      (canCreate ? '' : ' disabled') +
      '>Create poll</button>';
    html += '</div></div></div></div>';
    return html;
  }

  function readImportFormIntoState() {
    var tokenEl = document.getElementById('pa-import-token');
    if (tokenEl) state.importToken = tokenEl.value || '';
    var surveyEl = document.getElementById('pa-import-survey');
    if (surveyEl) state.importSurveyId = (surveyEl.value || '').trim();
    var baseEl = document.getElementById('pa-import-base');
    if (baseEl) state.importApiBase = baseEl.value || 'eu';
    var jsonEl = document.getElementById('pa-import-json');
    if (jsonEl) state.importJson = jsonEl.value || '';
  }

  function bindImportModal() {
    var backdrop = document.getElementById('pa-modal-backdrop');
    document.getElementById('pa-cancel-modal').addEventListener('click', function () {
      readImportFormIntoState();
      closeModal();
      renderList();
    });
    backdrop.addEventListener('click', function (ev) {
      if (ev.target === backdrop) {
        readImportFormIntoState();
        closeModal();
        renderList();
      }
    });
    var radios = cardEl.querySelectorAll('input[name="pa-import-source"]');
    for (var r = 0; r < radios.length; r++) {
      radios[r].addEventListener('change', function (ev) {
        readImportFormIntoState();
        state.importSource = ev.target.value;
        state.importPreview = null;
        state.modalError = null;
        renderList();
      });
    }
    var fetchBtn = document.getElementById('pa-import-fetch');
    if (fetchBtn) {
      fetchBtn.addEventListener('click', async function () {
        await fetchImportFromSm();
      });
    }
    var parseBtn = document.getElementById('pa-import-parse');
    if (parseBtn) {
      parseBtn.addEventListener('click', function () {
        parseImportJson();
      });
    }
    var fileEl = document.getElementById('pa-import-file');
    if (fileEl) {
      fileEl.addEventListener('change', function () {
        var f = fileEl.files && fileEl.files[0];
        if (!f) return;
        var reader = new FileReader();
        reader.onload = function () {
          state.importJson = String(reader.result || '');
          state.modalError = null;
          renderList();
        };
        reader.onerror = function () {
          state.modalError = 'Could not read file.';
          renderList();
        };
        reader.readAsText(f);
      });
    }
    var tog = document.getElementById('pa-import-toggle-preview');
    if (tog) {
      tog.addEventListener('click', function () {
        readImportFormIntoState();
        state.importPreviewOpen = !state.importPreviewOpen;
        renderList();
      });
    }
    var createBtn = document.getElementById('pa-import-create');
    if (createBtn) {
      createBtn.addEventListener('click', async function () {
        await createPollFromImport();
      });
    }
  }

  async function fetchImportFromSm() {
    readImportFormIntoState();
    state.modalError = null;
    if (!state.importToken.trim()) {
      state.modalError = 'Access token is required.';
      renderList();
      return;
    }
    if (!state.importSurveyId) {
      state.modalError = 'Survey ID is required.';
      renderList();
      return;
    }
    state.importProgress = 'Fetching…';
    renderList();
    setBusy(true);
    try {
      var details = await smApi(
        '/v3/surveys/' + encodeURIComponent(state.importSurveyId) + '/details',
        state.importToken.trim()
      );
      state.importPreview = buildImportPreviewFromSmDetails(details);
      state.importPreviewOpen = false;
      state.importProgress = null;
      state.modalError = null;
      renderList();
    } catch (e) {
      state.importPreview = null;
      state.importProgress = null;
      var msg = e.message || String(e);
      if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) {
        msg =
          'Could not reach SurveyMonkey (network/CORS). Check API base, or paste details JSON instead.';
      }
      state.modalError = msg;
      renderList();
    } finally {
      setBusy(false);
    }
  }

  function parseImportJson() {
    readImportFormIntoState();
    state.modalError = null;
    try {
      if (!state.importJson.trim()) throw new Error('Paste or upload JSON first.');
      state.importPreview = buildImportPreviewFromJson(state.importJson);
      state.importPreviewOpen = false;
      renderList();
    } catch (e) {
      state.importPreview = null;
      state.modalError = e.message || String(e);
      renderList();
    }
  }

  var IMPORT_CONCURRENCY = 8;

  async function mapPool(items, concurrency, worker) {
    var list = items || [];
    if (!list.length) return [];
    var results = new Array(list.length);
    var next = 0;
    async function run() {
      while (true) {
        var i = next;
        next += 1;
        if (i >= list.length) return;
        results[i] = await worker(list[i], i);
      }
    }
    var n = Math.min(Math.max(1, concurrency || 1), list.length);
    var runners = [];
    for (var r = 0; r < n; r++) runners.push(run());
    await Promise.all(runners);
    return results;
  }

  async function ensureOptionEntity(label, cacheByLabel) {
    var key = String(label || '').trim().toLowerCase();
    if (!key) throw new Error('Empty option label');
    if (cacheByLabel[key]) return cacheByLabel[key];
    cacheByLabel.__inflight = cacheByLabel.__inflight || {};
    if (cacheByLabel.__inflight[key]) return cacheByLabel.__inflight[key];

    if (!cacheByLabel.__seeded) {
      if (!cacheByLabel.__seedPromise) {
        cacheByLabel.__seedPromise = (async function () {
          await ensureOptionsCache();
          (state.optionsCache || []).forEach(function (ent) {
            var k = optionLabelOf(ent).trim().toLowerCase();
            if (k && !cacheByLabel[k]) cacheByLabel[k] = ent.sharedId;
          });
          cacheByLabel.__seeded = true;
        })();
      }
      await cacheByLabel.__seedPromise;
      if (cacheByLabel[key]) return cacheByLabel[key];
    }

    cacheByLabel.__inflight[key] = (async function () {
      var saved = await apiWrite('POST', '/api/entities', {
        title: label,
        template: CONFIG.templates.Option,
        published: false,
        language: 'en',
        metadata: {
          poll_label: [{ value: label }],
        },
      });
      var ent = saved.entity || saved;
      cacheByLabel[key] = ent.sharedId;
      if (state.optionsCache) state.optionsCache.push(ent);
      delete cacheByLabel.__inflight[key];
      return ent.sharedId;
    })();
    return cacheByLabel.__inflight[key];
  }

  function expectedImportItemCount(preview) {
    var n = 0;
    (preview.sections || []).forEach(function (sec) {
      (sec.items || []).forEach(function (it) {
        if (!it.skip) n += 1;
      });
    });
    return n;
  }

  function collectUniqueImportOptionLabels(preview) {
    var seen = {};
    var labels = [];
    (preview.sections || []).forEach(function (sec) {
      (sec.items || []).forEach(function (it) {
        if (it.skip || it.kind !== 'choice') return;
        (it.choices || []).forEach(function (c) {
          var lab = (c && c.text) || 'Option';
          var key = String(lab).trim().toLowerCase();
          if (!key || seen[key]) return;
          seen[key] = true;
          labels.push(lab);
        });
      });
    });
    return labels;
  }

  async function countImportedStructure(pollSharedId) {
    var sections = (await searchByTemplate(CONFIG.templates.Section)).filter(function (s) {
      return metaVal(s, 'poll_poll') === pollSharedId;
    });
    var questions = (await searchByTemplate(CONFIG.templates.Question)).filter(function (q) {
      return metaVal(q, 'poll_poll') === pollSharedId;
    });
    return { sections: sections.length, items: questions.length };
  }

  function importCompletenessMessage(preview, counts) {
    var wantSec = (preview.sections || []).length;
    var wantItems = expectedImportItemCount(preview);
    var gotSec = counts.sections;
    var gotItems = counts.items;
    var ok = gotSec === wantSec && gotItems === wantItems;
    return {
      ok: ok,
      wantSec: wantSec,
      wantItems: wantItems,
      gotSec: gotSec,
      gotItems: gotItems,
      summary:
        gotSec +
        '/' +
        wantSec +
        ' sections, ' +
        gotItems +
        '/' +
        wantItems +
        ' items',
    };
  }

  /**
   * Hybrid verify: trust create counters when they match preview; otherwise
   * retry search with backoff (ES can lag after parallel creates).
   */
  async function verifyImportedPoll(preview, pollSharedId, createdSections, createdItems) {
    var wantSec = (preview.sections || []).length;
    var wantItems = expectedImportItemCount(preview);
    if (createdSections === wantSec && createdItems === wantItems) {
      return {
        ok: true,
        source: 'counters',
        summary:
          createdSections +
          '/' +
          wantSec +
          ' sections, ' +
          createdItems +
          '/' +
          wantItems +
          ' items',
      };
    }

    var attempts = 0;
    var maxAttempts = 12;
    var lastCheck = null;
    var stableHits = 0;
    var prevSummary = '';
    while (attempts < maxAttempts) {
      attempts += 1;
      state.importProgress =
        'Verifying import… (search attempt ' + attempts + '/' + maxAttempts + ')';
      renderList();
      var counts = await countImportedStructure(pollSharedId);
      lastCheck = importCompletenessMessage(preview, counts);
      if (lastCheck.ok) {
        return {
          ok: true,
          source: 'search',
          summary: lastCheck.summary,
        };
      }
      if (lastCheck.summary === prevSummary) stableHits += 1;
      else {
        stableHits = 0;
        prevSummary = lastCheck.summary;
      }
      if (stableHits >= 3 && attempts >= 6) break;
      await sleep(2000);
    }

    return {
      ok: false,
      source: 'search',
      summary: lastCheck
        ? lastCheck.summary
        : createdSections +
          '/' +
          wantSec +
          ' sections, ' +
          createdItems +
          '/' +
          wantItems +
          ' items',
      runSummary:
        createdSections +
        '/' +
        wantSec +
        ' sections, ' +
        createdItems +
        '/' +
        wantItems +
        ' items (this run)',
    };
  }

  async function createPollFromImport() {
    var preview = state.importPreview;
    if (!preview) return;
    if (!configIsOk()) {
      state.modalError = 'Configuration is not valid.';
      renderList();
      return;
    }
    setBusy(true);
    var poll = null;
    var createdSections = 0;
    var createdItems = 0;
    try {
      await loadConfigDeps();
      if (!configIsOk()) {
        throw new Error('Configuration became invalid. Fix Configuration and retry.');
      }
      state.importProgress = 'Creating poll…';
      renderList();
      var pollSaved = await apiWrite('POST', '/api/entities', {
        title: preview.title,
        template: CONFIG.templates.Poll,
        published: false,
        language: 'en',
        metadata: {
          poll_description: preview.nickname
            ? [{ value: 'Imported from SurveyMonkey (' + preview.nickname + ')' }]
            : [{ value: 'Imported from SurveyMonkey' }],
          poll_status: [{ value: CONFIG.pollStatus.draft }],
        },
      });
      poll = pollSaved.entity || pollSaved;

      var optionCache = {};
      var uniqueLabels = collectUniqueImportOptionLabels(preview);
      if (uniqueLabels.length) {
        var optDone = 0;
        state.importProgress = 'Creating options… 0/' + uniqueLabels.length;
        renderList();
        await mapPool(uniqueLabels, IMPORT_CONCURRENCY, async function (lab) {
          await ensureOptionEntity(lab, optionCache);
          optDone += 1;
          if (optDone % 20 === 0 || optDone === uniqueLabels.length) {
            state.importProgress =
              'Creating options… ' + optDone + '/' + uniqueLabels.length;
            renderList();
          }
        });
      }

      var wantItems = expectedImportItemCount(preview);
      var sectionJobs = (preview.sections || []).map(function (secPrev, s) {
        return { secPrev: secPrev, index: s };
      });
      state.importProgress =
        'Creating sections… 0/' + sectionJobs.length + ' (×' + IMPORT_CONCURRENCY + ')';
      renderList();
      var sectionResults = await mapPool(sectionJobs, IMPORT_CONCURRENCY, async function (job) {
        var secSaved = await apiWrite('POST', '/api/entities', {
          title: job.secPrev.title,
          template: CONFIG.templates.Section,
          published: false,
          language: 'en',
          metadata: {
            poll_number: [{ value: job.index + 1 }],
            poll_poll: [{ value: poll.sharedId }],
          },
        });
        createdSections += 1;
        state.importProgress =
          'Creating sections… ' +
          createdSections +
          '/' +
          sectionJobs.length +
          ' (×' +
          IMPORT_CONCURRENCY +
          ')';
        renderList();
        return {
          index: job.index,
          section: secSaved.entity || secSaved,
          secPrev: job.secPrev,
        };
      });
      sectionResults.sort(function (a, b) {
        return a.index - b.index;
      });

      var questionJobs = [];
      sectionResults.forEach(function (sr) {
        var qNum = 0;
        (sr.secPrev.items || []).forEach(function (it) {
          if (it.skip) return;
          qNum += 1;
          questionJobs.push({
            it: it,
            qNum: qNum,
            sectionIndex: sr.index,
            sectionSharedId: sr.section.sharedId,
          });
        });
      });

      state.importProgress =
        'Creating questions… 0/' + wantItems + ' (×' + IMPORT_CONCURRENCY + ')';
      renderList();
      await mapPool(questionJobs, IMPORT_CONCURRENCY, async function (job) {
        var it = job.it;
        var typeId = CONFIG.qType.free_text;
        var allowMulti = CONFIG.yesNo.no;
        if (it.kind === 'instructions') typeId = CONFIG.qType.instructions;
        else if (it.kind === 'numeric') typeId = CONFIG.qType.numeric;
        else if (it.kind === 'date') typeId = CONFIG.qType.date;
        else if (it.kind === 'choice') {
          typeId = CONFIG.qType.choice;
          allowMulti = it.allowMultiple ? CONFIG.yesNo.yes : CONFIG.yesNo.no;
        } else if (it.kind === 'free_text') typeId = CONFIG.qType.free_text;

        var optionIds = [];
        if (it.kind === 'choice') {
          for (var c = 0; c < it.choices.length; c++) {
            var lab = it.choices[c].text || 'Option';
            optionIds.push(await ensureOptionEntity(lab, optionCache));
          }
        }
        var title =
          job.sectionIndex +
          1 +
          '.' +
          job.qNum +
          ' ' +
          String(it.heading || '').slice(0, 80);
        var metadata = {
          poll_number: [{ value: job.qNum }],
          poll_question_text: [{ value: it.heading || '' }],
          poll_type: [{ value: typeId }],
          poll_section: [{ value: job.sectionSharedId }],
          poll_poll: [{ value: poll.sharedId }],
          poll_allow_multiple: [{ value: allowMulti }],
        };
        if (optionIds.length) {
          metadata.poll_available_options = optionIds.map(function (id) {
            return { value: id };
          });
        }
        await apiWrite('POST', '/api/entities', {
          title: title,
          template: CONFIG.templates.Question,
          published: false,
          language: 'en',
          metadata: metadata,
        });
        createdItems += 1;
        if (createdItems % 20 === 0 || createdItems === wantItems) {
          state.importProgress =
            'Creating questions… ' +
            createdItems +
            '/' +
            wantItems +
            ' (×' +
            IMPORT_CONCURRENCY +
            ')';
          renderList();
        }
      });

      state.importProgress = 'Verifying import…';
      renderList();
      var check = await verifyImportedPoll(
        preview,
        poll.sharedId,
        createdSections,
        createdItems
      );
      state.importProgress = null;
      state.optionsCache = null;
      closeModal();
      if (check.ok) {
        state.toast = {
          message: 'Imported “' + preview.title + '” (' + check.summary + ').',
          pollSharedId: poll.sharedId,
        };
        state.error = null;
      } else {
        state.toast = {
          message:
            'Import incomplete for “' +
            preview.title +
            '” (' +
            check.summary +
            '). Open structure to review.',
          pollSharedId: poll.sharedId,
        };
        state.error =
          'Import finished but counts do not match the preview (' +
          check.summary +
          (check.runSummary ? '; ' + check.runSummary : '') +
          ').';
      }
      await loadPolls();
      state.view = 'list';
      renderList();
    } catch (e) {
      state.importProgress = null;
      var detail = e.message || String(e);
      if (poll && poll.sharedId) {
        try {
          var partial = await countImportedStructure(poll.sharedId);
          var wantSec = (preview.sections || []).length;
          var wantItemsFail = expectedImportItemCount(preview);
          detail +=
            ' — partial import: ' +
            partial.sections +
            '/' +
            wantSec +
            ' sections, ' +
            partial.items +
            '/' +
            wantItemsFail +
            ' items (created this run: ' +
            createdSections +
            ' sections, ' +
            createdItems +
            ' items).';
          state.toast = {
            message: 'Import stopped early. Open the partial poll to review.',
            pollSharedId: poll.sharedId,
          };
        } catch (ignore) {
          detail +=
            ' — stopped after creating ' +
            createdSections +
            ' sections / ' +
            createdItems +
            ' items.';
        }
      }
      state.modalError = detail;
      renderList();
    } finally {
      setBusy(false);
    }
  }


  function renderSessions() {
    var p = state.poll;
    var head =
      '<h1 class="pa-heading">Sessions — ' +
      escapeHtml(p.title || '') +
      '</h1>' +
      '<p class="pa-sub">One session = one attempt. Share the link (poll + token). Login is still required to write answers.</p>';
    var html = '';
    html += '<div class="pa-toolbar">';
    html += '<button type="button" class="pa-btn" id="pa-back">Back to list</button>';
    html += '<button type="button" class="pa-btn" id="pa-to-structure">Structure</button>';
    html +=
      '<button type="button" class="pa-btn primary" id="pa-add-session">New session</button>';
    html += '</div>';
    html += errorHtml();

    if (!state.sessions.length) {
      html += '<p class="pa-muted">No sessions yet for this poll.</p>';
    } else {
      html +=
        '<table class="pa-table"><thead><tr>' +
        '<th>Respondent</th><th>Status</th><th>Created</th><th>Accepted</th><th>Token</th><th></th>' +
        '</tr></thead><tbody>';
      state.sessions.forEach(function (s) {
        var token = metaVal(s, 'poll_token') || '';
        var st = sessionStatusLabel(s);
        var stCls =
          st === 'accepted' ? 'published' : st === 'in_progress' ? 'draft' : 'closed';
        html += '<tr>';
        html +=
          '<td>' +
          escapeHtml(metaVal(s, 'poll_respondent') || s.title || '—') +
          '</td>';
        html +=
          '<td><span class="pa-pill ' + stCls + '">' + escapeHtml(st) + '</span></td>';
        html +=
          '<td class="pa-muted">' +
          escapeHtml(formatSessionDate(s.creationDate)) +
          '</td>';
        html +=
          '<td class="pa-muted">' +
          escapeHtml(formatSessionDate(metaVal(s, 'poll_accepted_at'))) +
          '</td>';
        html +=
          '<td><code class="pa-token">' +
          escapeHtml(token ? token.slice(0, 8) + '...' : '—') +
          '</code></td>';
        html += '<td class="pa-row-actions">';
        if (token) {
          html +=
            '<button type="button" class="pa-btn pa-copy-link" data-token="' +
            escapeHtml(token) +
            '">Copy link</button>';
        } else {
          html += '<span class="pa-muted">No token — fix Session template</span>';
        }
        if (st === 'accepted') {
          html +=
            '<button type="button" class="pa-btn pa-reopen-session" data-id="' +
            escapeHtml(s.sharedId) +
            '">Reopen</button>';
        }
        html += '</td></tr>';
      });
      html += '</tbody></table>';
    }

    html = appendActiveModal(html);
    renderShell(html, head);
    document.getElementById('pa-back').addEventListener('click', function () {
      closeModal();
      state.view = 'list';
      bootList();
    });
    document.getElementById('pa-to-structure').addEventListener('click', function () {
      closeModal();
      openPoll(p.sharedId, 'structure');
    });
    document.getElementById('pa-add-session').addEventListener('click', function () {
      state.editingSession = { _new: true };
      state.modal = 'session';
      state.modalError = null;
      renderSessions();
    });
    var copies = cardEl.querySelectorAll('.pa-copy-link');
    for (var i = 0; i < copies.length; i++) {
      copies[i].addEventListener('click', function (ev) {
        var btn = ev.currentTarget;
        var token = btn.getAttribute('data-token');
        var url =
          window.location.origin + sessionPlayerUrl(state.poll.sharedId, token);
        function markCopied() {
          if (!btn) return;
          var prev = btn.textContent;
          btn.textContent = 'Copied';
          setTimeout(function () {
            if (btn) btn.textContent = prev || 'Copy link';
          }, 1500);
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(markCopied, function () {
            window.prompt('Copy link', url);
          });
        } else {
          window.prompt('Copy link', url);
        }
      });
    }
    var reopens = cardEl.querySelectorAll('.pa-reopen-session');
    for (var r = 0; r < reopens.length; r++) {
      reopens[r].addEventListener('click', async function (ev) {
        var id = ev.currentTarget.getAttribute('data-id');
        if (!id) return;
        if (
          !window.confirm(
            'Reopen this session? The respondent will be able to edit answers again with the same link.'
          )
        ) {
          return;
        }
        await reopenSession(id);
      });
    }
    bindActiveModal();
  }

  async function reopenSession(sharedId) {
    var s = (state.sessions || []).find(function (row) {
      return row.sharedId === sharedId;
    });
    if (!s) {
      state.error = 'Session not found.';
      renderSessions();
      return;
    }
    setBusy(true);
    try {
      var metadata = {
        poll_poll: [{ value: metaVal(s, 'poll_poll') || state.poll.sharedId }],
        poll_session_status: [{ value: CONFIG.sessionStatus.in_progress }],
        poll_respondent: [{ value: metaVal(s, 'poll_respondent') || s.title || '' }],
        poll_accepted_at: [],
      };
      var token = metaVal(s, 'poll_token');
      if (token) metadata.poll_token = [{ value: token }];
      var saved = await api('POST', '/api/entities', {
        _id: s._id,
        sharedId: s.sharedId,
        title: s.title,
        template: CONFIG.templates.Session,
        published: false,
        language: 'en',
        metadata: metadata,
      });
      var ent = saved.entity || saved;
      var idx = state.sessions.findIndex(function (row) {
        return row.sharedId === sharedId;
      });
      if (idx >= 0) state.sessions[idx] = ent;
      state.error = null;
      renderSessions();
    } catch (e) {
      state.error = e.message || String(e);
      renderSessions();
    } finally {
      setBusy(false);
    }
  }

  function renderSessionModalHtml() {
    var html = '';
    html += '<div class="pa-modal-backdrop" id="pa-modal-backdrop">';
    html += '<div class="pa-modal" role="dialog" aria-modal="true">';
    html += '<h2>New session</h2>';
    html += modalErrorHtml();
    html += '<div class="pa-form">';
    html +=
      '<div class="pa-field"><label for="pa-respondent">Respondent label</label>' +
      '<input id="pa-respondent" type="text" placeholder="e.g. Country X — reviewer A" />' +
      '<p class="pa-muted" style="margin:0.35rem 0 0">Free-text label only (not linked to a Uwazi user). A secret token is generated for the link.</p></div>';
    html += '<div class="pa-actions">';
    html += '<button type="button" class="pa-btn" id="pa-cancel-modal">Cancel</button>';
    html += '<button type="button" class="pa-btn primary" id="pa-save-session">Create</button>';
    html += '</div></div></div></div>';
    return html;
  }

  function bindSessionModal() {
    var backdrop = document.getElementById('pa-modal-backdrop');
    document.getElementById('pa-cancel-modal').addEventListener('click', function () {
      closeModal();
      renderSessions();
    });
    backdrop.addEventListener('click', function (ev) {
      if (ev.target === backdrop) {
        closeModal();
        renderSessions();
      }
    });
    document.getElementById('pa-save-session').addEventListener('click', async function () {
      await saveSessionModal();
    });
    var el = document.getElementById('pa-respondent');
    if (el) el.focus();
  }

  async function saveSessionModal() {
    var label = (document.getElementById('pa-respondent').value || '').trim();
    if (!label) {
      state.modalError = 'Respondent label is required.';
      renderSessions();
      return;
    }
    if (!CONFIG.templates.Session) {
      state.modalError = 'Session template missing — use Templates setup first.';
      renderSessions();
      return;
    }
    var token = generateToken();
    setBusy(true);
    try {
      var saved = await api('POST', '/api/entities', {
        title: label + ' · ' + (state.poll.title || 'poll'),
        template: CONFIG.templates.Session,
        published: false,
        language: 'en',
        metadata: {
          poll_poll: [{ value: state.poll.sharedId }],
          poll_session_status: [{ value: CONFIG.sessionStatus.in_progress }],
          poll_respondent: [{ value: label }],
          poll_token: [{ value: token }],
        },
      });
      var ent = saved.entity || saved;
      if (!ent.metadata) ent.metadata = {};
      // Ensure list can copy immediately even if API omits token on create response.
      ent.metadata.poll_token = [{ value: token }];
      ent.metadata.poll_respondent = [{ value: label }];
      ent.metadata.poll_poll = [{ value: state.poll.sharedId }];
      ent.metadata.poll_session_status = [{ value: CONFIG.sessionStatus.in_progress }];
      state.sessions.unshift(ent);
      closeModal();
      state.error = null;
      renderSessions();
    } catch (e) {
      state.modalError = e.message || String(e);
      renderSessions();
    } finally {
      setBusy(false);
    }
  }

  function render() {
    if (state.view === 'list') renderList();
    else if (state.view === 'structure') renderStructure();
    else if (state.view === 'sessions') renderSessions();
  }

  async function bootList() {
    setBusy(true);
    state.error = null;
    try {
      try {
        await loadConfigDeps();
        buildConfigReports();
      } catch (ignore) {
        state.templateReport = null;
        state.thesaurusReport = null;
        state.relationTypeReport = null;
      }
      await loadPolls();
      state.view = 'list';
      renderList();
    } catch (e) {
      renderShell(
        '<p class="pa-error">' + escapeHtml(e.message || String(e)) + '</p>'
      );
    } finally {
      setBusy(false);
    }
  }

  async function init() {
    state.user = getUser();
    if (!state.user || !state.user._id) {
      renderShell('<p class="pa-error">Please log in as an admin or editor to manage polls.</p>');
      return;
    }
    var role = state.user.role;
    if (role && role !== 'admin' && role !== 'editor') {
      renderShell('<p class="pa-error">Poll admin requires an admin or editor account.</p>');
      return;
    }
    renderShell('<p class="pa-muted">Loading polls...</p>');
    try {
      await resolvePlayerPage();
    } catch (e) {
      renderShell(
        '<p class="pa-error">' + escapeHtml(e.message || String(e)) + '</p>'
      );
      return;
    }
    await bootList();
  }

  init();
})();
