/* Poll hub — respondent landing: sessions claimed/assigned to the current user. */
(function () {
  var NS = '[Poll] ';
  var CONFIG = {
    templates: {
      Poll: '',
      Session: '',
    },
    templateNames: {
      Poll: NS + 'Poll',
      Session: NS + 'Session',
    },
    thesaurusNames: {
      sessionStatus: NS + 'Session status',
    },
    sessionStatus: {
      in_progress: '',
      accepted: '',
    },
    playerPage: '',
  };

  var root = document.getElementById('poll-hub');
  if (!root) return;
  var cardEl = document.getElementById('ph-card') || root;

  var state = {
    user: null,
    rows: [], // { session, poll }
    error: null,
  };

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function metaList(entity, name) {
    var m = entity && entity.metadata && entity.metadata[name];
    return Array.isArray(m) ? m : [];
  }

  function metaVal(entity, name) {
    var m = metaList(entity, name);
    return m.length && m[0] && m[0].value !== undefined ? m[0].value : undefined;
  }

  function api(method, path, body) {
    var opts = {
      method: method,
      credentials: 'same-origin',
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        Accept: 'application/json',
      },
    };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    return fetch(path, opts).then(function (res) {
      return res.text().then(function (text) {
        var data;
        try {
          data = text ? JSON.parse(text) : null;
        } catch (e) {
          data = text;
        }
        if (!res.ok) {
          var msg =
            (data && (data.error || data.prettyMessage || data.message)) ||
            res.statusText ||
            'Request failed';
          throw new Error(msg);
        }
        return data;
      });
    });
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

  function getUserFromStore() {
    try {
      var u = window.store.getState().user;
      return u && u.toJS ? u.toJS() : u;
    } catch (e) {
      return null;
    }
  }

  async function getUser() {
    var fromStore = getUserFromStore();
    if (fromStore && fromStore._id) return fromStore;
    try {
      var u = await api('GET', '/api/user');
      return u;
    } catch (e) {
      return null;
    }
  }

  function currentLangPrefix() {
    var m = window.location.pathname.match(/^\/([a-z]{2}(?:-[a-z]+)?)\//i);
    return m ? '/' + m[1] : '/en';
  }

  async function resolvePlayerPage() {
    var pages = await api('GET', '/api/pages');
    var list = Array.isArray(pages) ? pages : pages && pages.rows ? pages.rows : [];
    var player = list.find(function (p) {
      var t = p.title || (p.locales && p.locales.en && p.locales.en.title);
      return nameEq(t, 'Poll player');
    });
    if (!player || !player.sharedId) {
      throw new Error(
        'Could not find a Page titled "Poll player". Ask an admin to publish it first.'
      );
    }
    CONFIG.playerPage = currentLangPrefix() + '/page/' + player.sharedId + '/poll-player';
  }

  async function resolveConfig() {
    var tplData = await api('GET', '/api/templates');
    var templates = tplData.rows || [];
    Object.keys(CONFIG.templateNames).forEach(function (key) {
      var found = findByName(templates, CONFIG.templateNames[key]);
      if (found && found._id) CONFIG.templates[key] = found._id;
    });
    var missing = Object.keys(CONFIG.templates).filter(function (k) {
      return !CONFIG.templates[k];
    });
    if (missing.length) {
      throw new Error(
        'Missing poll templates: ' +
          missing
            .map(function (k) {
              return CONFIG.templateNames[k];
            })
            .join(', ')
      );
    }

    var thData = await api('GET', '/api/thesauris');
    var thesauri = thData.rows || thData || [];
    var th = findByName(thesauri, CONFIG.thesaurusNames.sessionStatus);
    if (!th) throw new Error('Missing thesaurus "' + CONFIG.thesaurusNames.sessionStatus + '".');
    ['in_progress', 'accepted'].forEach(function (label) {
      var val = findThesaurusValueByLabel(th, label);
      if (!val || !val.id) {
        throw new Error('Missing thesaurus value "' + label + '".');
      }
      CONFIG.sessionStatus[label] = val.id;
    });

    await resolvePlayerPage();
  }

  async function searchByTemplate(templateId) {
    var url =
      '/api/search?types=' +
      encodeURIComponent(JSON.stringify([templateId])) +
      '&includeUnpublished=true&limit=3000';
    var data = await api('GET', url);
    return data.rows || [];
  }

  async function loadEntity(sharedId) {
    var data = await api('GET', '/api/entities?sharedId=' + encodeURIComponent(sharedId));
    var rows = data.rows || (Array.isArray(data) ? data : [data]);
    return rows[0] || null;
  }

  function sessionStatusLabel(session) {
    var id = metaVal(session, 'poll_session_status');
    if (id === CONFIG.sessionStatus.accepted) return 'accepted';
    if (id === CONFIG.sessionStatus.in_progress) return 'in_progress';
    return '—';
  }

  function sessionStatusCellHtml(session) {
    if (sessionStatusLabel(session) === 'accepted') {
      return '<span class="ph-pill">accepted</span>';
    }
    var answered = metaVal(session, 'poll_answered_count');
    var total = metaVal(session, 'poll_question_count');
    if (total === undefined || total === null || total === '') {
      return '<span class="ph-muted">—</span>';
    }
    var a = Number(answered);
    var t = Number(total);
    if (!Number.isFinite(t) || t < 0) t = 0;
    if (!Number.isFinite(a) || a < 0) a = 0;
    var pct = t ? Math.min(100, Math.round((a / t) * 100)) : 0;
    return (
      '<div class="ph-sess-progress" title="' +
      escapeHtml(a + ' of ' + t + ' answered') +
      '">' +
      '<div class="ph-sess-bar"><span style="width:' +
      pct +
      '%"></span></div>' +
      '<span class="ph-sess-progress-label">' +
      escapeHtml(String(a) + ' / ' + String(t)) +
      '</span></div>'
    );
  }

  function playerUrl(pollSharedId, token) {
    return (
      CONFIG.playerPage +
      '?poll=' +
      encodeURIComponent(pollSharedId) +
      '&token=' +
      encodeURIComponent(token)
    );
  }

  function renderShell(html) {
    cardEl.innerHTML = html;
  }

  function renderLogin() {
    renderShell(
      '<p class="ph-error">Sign in to see the polls assigned to you.</p>' +
        '<p class="ph-muted" style="margin-top:0.65rem">Log in to this collection, then open this page again.</p>'
    );
  }

  function renderList() {
    if (!state.rows.length) {
      renderShell(
        '<p class="ph-muted">No polls are assigned to you yet.</p>' +
          '<p class="ph-muted" style="margin-top:0.45rem">When an administrator assigns you a session, it will show up here.</p>'
      );
      return;
    }
    var html =
      '<table class="ph-table"><thead><tr>' +
      '<th>Poll</th><th>Status</th><th></th>' +
      '</tr></thead><tbody>';
    state.rows.forEach(function (row) {
      var session = row.session;
      var poll = row.poll;
      var pollTitle = (poll && poll.title) || 'Poll';
      var respondent = metaVal(session, 'poll_respondent') || session.title || '';
      var token = metaVal(session, 'poll_token') || '';
      var pollId = metaVal(session, 'poll_poll') || (poll && poll.sharedId) || '';
      html += '<tr>';
      html += '<td>';
      html += '<p class="ph-poll-title">' + escapeHtml(pollTitle) + '</p>';
      if (respondent) {
        html += '<p class="ph-respondent">' + escapeHtml(respondent) + '</p>';
      }
      html += '</td>';
      html += '<td>' + sessionStatusCellHtml(session) + '</td>';
      html += '<td class="ph-actions">';
      if (token && pollId) {
        html +=
          '<a class="ph-btn primary" href="' +
          escapeHtml(playerUrl(pollId, token)) +
          '">Open</a>';
      } else {
        html += '<span class="ph-muted">Unavailable</span>';
      }
      html += '</td></tr>';
    });
    html += '</tbody></table>';
    renderShell(html);
  }

  async function loadMySessions() {
    var userId = String(state.user._id);
    var sessions = await searchByTemplate(CONFIG.templates.Session);
    var mine = sessions.filter(function (s) {
      return String(metaVal(s, 'poll_claimed_user') || '') === userId;
    });
    mine.sort(function (a, b) {
      return String(b.creationDate || 0).localeCompare(String(a.creationDate || 0));
    });

    var pollCache = {};
    var rows = [];
    for (var i = 0; i < mine.length; i++) {
      var session = mine[i];
      var pollId = metaVal(session, 'poll_poll');
      var poll = null;
      if (pollId) {
        if (!Object.prototype.hasOwnProperty.call(pollCache, pollId)) {
          try {
            pollCache[pollId] = await loadEntity(pollId);
          } catch (e) {
            pollCache[pollId] = null;
          }
        }
        poll = pollCache[pollId];
      }
      rows.push({ session: session, poll: poll });
    }
    state.rows = rows;
  }

  async function init() {
    renderShell('<p class="ph-muted">Loading…</p>');
    try {
      state.user = await getUser();
      if (!state.user || !state.user._id) {
        renderLogin();
        return;
      }
      await resolveConfig();
      await loadMySessions();
      renderList();
    } catch (e) {
      renderShell(
        '<p class="ph-error">' + escapeHtml(e.message || String(e)) + '</p>'
      );
    }
  }

  init();
})();
