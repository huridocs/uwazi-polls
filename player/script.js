/* Poll player — ?poll=<sharedId> (defaults to GTI 2026) */
(function () {
  var NS = '[Poll] ';
  var CONFIG = {
    defaultPollId: '',
    templates: {
      Option: '',
      Poll: '',
      Section: '',
      Question: '',
      Session: '',
      Answer: '',
    },
    templateNames: {
      Option: NS + 'Option',
      Poll: NS + 'Poll',
      Section: NS + 'Section',
      Question: NS + 'Question',
      Session: NS + 'Session',
      Answer: NS + 'Answer',
    },
    thesaurusNames: {
      qType: NS + 'Question type',
      yesNo: NS + 'Yes No',
      sessionStatus: NS + 'Session status',
    },
    qType: {
      choice: '',
      free_text: '',
      numeric: '',
      choice_and_text: '',
      instructions: '',
    },
    yesNo: {
      yes: '',
      no: '',
    },
    sessionStatus: {
      in_progress: '',
      accepted: '',
    },
  };

  var root = document.getElementById('poll-player');
  if (!root) return;
  var titleEl = document.getElementById('pp-title');
  var cardEl = document.getElementById('pp-card') || root;

  var state = {
    pollId: null,
    poll: null,
    sectionsById: {},
    items: [], // ordered walk: { question, section }
    index: 0,
    user: null,
    session: null,
    token: null,
    answersByQuestion: {},
    busy: false,
    done: false,
    tocOpen: false,
    /** Multi-select TOC filters; empty/all-false = show everything. */
    tocFilters: { answered: false, pending: false, instructions: false },
  };

  function tocItemStatus(q) {
    if (questionType(q) === 'instructions') return 'instructions';
    if (state.answersByQuestion[q.sharedId]) return 'answered';
    return 'pending';
  }

  function tocFiltersActive() {
    var f = state.tocFilters;
    return !!(f.answered || f.pending || f.instructions);
  }

  function tocItemVisible(status) {
    if (!tocFiltersActive()) return true;
    return !!state.tocFilters[status];
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

  function typeKeyFromId(id) {
    var map = CONFIG.qType;
    for (var k in map) if (map[k] === id) return k;
    var label = null;
    return label;
  }

  function questionType(q) {
    var entry = metaEntry(q, 'poll_type');
    if (!entry) return null;
    if (entry.label) {
      var lab = String(entry.label).toLowerCase().replace(/\s+/g, '_');
      if (lab === 'instructions') return 'instructions';
      if (lab === 'choice') return 'choice';
      if (lab === 'free_text' || lab === 'free text') return 'free_text';
      if (lab === 'choice_and_text' || lab === 'choice + other field') return 'choice_and_text';
      if (lab === 'numeric') return 'numeric';
    }
    for (var k in CONFIG.qType) {
      if (CONFIG.qType[k] === entry.value) return k;
    }
    return null;
  }

  function isAnswerable(q) {
    var t = questionType(q);
    return t && t !== 'instructions';
  }

  function allowMultiple(q) {
    return metaVal(q, 'poll_allow_multiple') === CONFIG.yesNo.yes;
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

  async function resolveConfigFromInstance() {
    var tplData = await api('GET', '/api/templates');
    var templates = tplData.rows || [];
    Object.keys(CONFIG.templateNames).forEach(function (key) {
      var found = findByName(templates, CONFIG.templateNames[key]);
      if (found && found._id) CONFIG.templates[key] = found._id;
    });
    var missingTpl = Object.keys(CONFIG.templates).filter(function (k) {
      return !CONFIG.templates[k];
    });
    if (missingTpl.length) {
      throw new Error(
        'Missing poll templates: ' +
          missingTpl.map(function (k) {
            return CONFIG.templateNames[k];
          }).join(', ') +
          '. Use Poll admin → Configuration to create them.'
      );
    }

    var thData = await api('GET', '/api/thesauris');
    var thesauri = thData.rows || thData || [];
    function syncValues(thName, target, labels) {
      var th = findByName(thesauri, thName);
      if (!th) throw new Error('Missing thesaurus "' + thName + '".');
      labels.forEach(function (label) {
        var val = findThesaurusValueByLabel(th, label);
        if (!val || !val.id) {
          throw new Error('Missing thesaurus value "' + label + '" in "' + thName + '".');
        }
        target[label] = val.id;
      });
    }
    syncValues(CONFIG.thesaurusNames.qType, CONFIG.qType, [
      'choice',
      'free_text',
      'numeric',
      'choice_and_text',
      'instructions',
    ]);
    syncValues(CONFIG.thesaurusNames.yesNo, CONFIG.yesNo, ['yes', 'no']);
    syncValues(CONFIG.thesaurusNames.sessionStatus, CONFIG.sessionStatus, [
      'in_progress',
      'accepted',
    ]);
  }

  function getUser() {
    try {
      var u = window.store.getState().user;
      return u && u.toJS ? u.toJS() : u;
    } catch (e) {
      return null;
    }
  }

  function setPollTitle(title) {
    if (!titleEl) return;
    if (title) {
      titleEl.hidden = false;
      titleEl.textContent = title;
    } else {
      titleEl.hidden = true;
      titleEl.textContent = '';
    }
  }

  function renderShell(html) {
    cardEl.innerHTML = html;
  }

  function setBusy(busy) {
    state.busy = busy;
    var buttons = root.querySelectorAll('button');
    for (var i = 0; i < buttons.length; i++) buttons[i].disabled = busy;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function currentItem() {
    return state.items[state.index];
  }

  function shortQuestionLabel(q) {
    var text = metaVal(q, 'poll_question_text') || q.title || '';
    var line = String(text).split('\n').map(function (s) { return s.trim(); }).filter(Boolean)[0] || 'Item';
    return line.length > 72 ? line.slice(0, 69) + '…' : line;
  }

  function sectionStats(sectionSharedId) {
    var total = 0;
    var answered = 0;
    state.items.forEach(function (item) {
      if (item.section.sharedId !== sectionSharedId) return;
      if (!isAnswerable(item.question)) return;
      total += 1;
      if (state.answersByQuestion[item.question.sharedId]) answered += 1;
    });
    return { total: total, answered: answered };
  }

  function overallAnswerStats() {
    var total = 0;
    var answered = 0;
    state.items.forEach(function (item) {
      if (!isAnswerable(item.question)) return;
      total += 1;
      if (state.answersByQuestion[item.question.sharedId]) answered += 1;
    });
    return { total: total, answered: answered };
  }

  function tocToggleButton() {
    var label = state.tocOpen ? 'Back to question' : 'Contents';
    var icon = state.tocOpen
      ? '<svg class="pp-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>'
      : '<svg class="pp-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/></svg>';
    return (
      '<button type="button" class="pp-toc-toggle" id="pp-toc-toggle" title="' +
      label +
      '" aria-label="' +
      label +
      '">' +
      icon +
      '<span>' +
      label +
      '</span></button>'
    );
  }

  function sectionGuidanceItems(sectionSharedId) {
    var out = [];
    state.items.forEach(function (item) {
      if (item.section.sharedId !== sectionSharedId) return;
      if (questionType(item.question) !== 'instructions') return;
      out.push(item.question);
    });
    return out;
  }

  function sectionGuidanceLinkHtml() {
    return (
      '<button type="button" class="pp-link pp-guidance-corner" id="pp-section-guidance">' +
      'Section instructions</button>'
    );
  }

  function closeGuidanceModal() {
    var el = document.getElementById('pp-guidance-backdrop');
    if (el && el.parentNode) el.parentNode.removeChild(el);
    root.classList.remove('pp-has-modal');
  }

  function openGuidanceModal() {
    closeGuidanceModal();
    var item = currentItem();
    if (!item) return;
    var section = item.section;
    var guidance = sectionGuidanceItems(section.sharedId);
    var title =
      'Section ' +
      (metaVal(section, 'poll_number') || '') +
      ' — ' +
      (section.title || 'Instructions');
    var html = '';
    html += '<div class="pp-guidance-backdrop" id="pp-guidance-backdrop" role="presentation">';
    html +=
      '<div class="pp-guidance-modal" role="dialog" aria-modal="true" aria-labelledby="pp-guidance-title">';
    html += '<div class="pp-guidance-modal-head">';
    html += '<h2 id="pp-guidance-title">' + escapeHtml(title) + '</h2>';
    html +=
      '<button type="button" class="pp-btn" id="pp-guidance-close" aria-label="Close">Close</button>';
    html += '</div>';
    html += '<div class="pp-guidance-modal-body">';
    if (!guidance.length) {
      html += '<p class="pp-muted">No instructions for this section.</p>';
    } else {
      guidance.forEach(function (q) {
        var qText = metaVal(q, 'poll_question_text') || q.title || '';
        html +=
          '<div class="pp-instructions"><div class="pp-qtext">' +
          escapeHtml(qText) +
          '</div></div>';
      });
    }
    html += '</div></div></div>';

    var wrap = document.createElement('div');
    wrap.innerHTML = html;
    var backdrop = wrap.firstChild;
    root.classList.add('pp-has-modal');
    root.appendChild(backdrop);

    function close() {
      closeGuidanceModal();
    }
    document.getElementById('pp-guidance-close').addEventListener('click', close);
    backdrop.addEventListener('click', function (ev) {
      if (ev.target === backdrop) close();
    });
  }

  function bindGuidanceLink() {
    var btn = document.getElementById('pp-section-guidance');
    if (!btn) return;
    btn.addEventListener('click', function () {
      openGuidanceModal();
    });
  }


  function closeAppModal() {
    var el = document.getElementById('pp-app-modal-backdrop');
    if (el && el.parentNode) el.parentNode.removeChild(el);
    // Keep has-modal if guidance still open
    if (!document.getElementById('pp-guidance-backdrop')) {
      root.classList.remove('pp-has-modal');
    }
  }

  /**
   * @param {{ title: string, message: string, confirmLabel?: string, cancelLabel?: string }} opts
   * @returns {Promise<boolean>}
   */
  function openConfirmModal(opts) {
    closeAppModal();
    return new Promise(function (resolve) {
      var html = '';
      html += '<div class="pp-guidance-backdrop" id="pp-app-modal-backdrop" role="presentation">';
      html +=
        '<div class="pp-guidance-modal pp-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="pp-confirm-title">';
      html += '<div class="pp-guidance-modal-head">';
      html += '<h2 id="pp-confirm-title">' + escapeHtml(opts.title || 'Confirm') + '</h2>';
      html += '</div>';
      html += '<div class="pp-guidance-modal-body">';
      html += '<p class="pp-confirm-message">' + escapeHtml(opts.message || '') + '</p>';
      html += '</div>';
      html += '<div class="pp-confirm-actions">';
      html +=
        '<button type="button" class="pp-btn" id="pp-confirm-cancel">' +
        escapeHtml(opts.cancelLabel || 'Cancel') +
        '</button>';
      html +=
        '<button type="button" class="pp-btn pp-btn-primary" id="pp-confirm-ok">' +
        escapeHtml(opts.confirmLabel || 'Confirm') +
        '</button>';
      html += '</div></div></div>';

      var wrap = document.createElement('div');
      wrap.innerHTML = html;
      var backdrop = wrap.firstChild;
      root.classList.add('pp-has-modal');
      root.appendChild(backdrop);

      var settled = false;
      function finish(val) {
        if (settled) return;
        settled = true;
        closeAppModal();
        resolve(val);
      }
      document.getElementById('pp-confirm-cancel').addEventListener('click', function () {
        finish(false);
      });
      document.getElementById('pp-confirm-ok').addEventListener('click', function () {
        finish(true);
      });
      backdrop.addEventListener('click', function (ev) {
        if (ev.target === backdrop) finish(false);
      });
    });
  }

  function progressHtml() {
    var item = currentItem();
    var section = item.section;
    var secNum = metaVal(section, 'poll_number') || '?';
    var secTotal = Object.keys(state.sectionsById).length;
    var stats = overallAnswerStats();
    var pct = stats.total ? Math.round((stats.answered / stats.total) * 100) : 0;
    return (
      '<div class="pp-toolbar">' +
      tocToggleButton() +
      '<div class="pp-progress">' +
      '<div class="pp-bar"><span style="width:' +
      pct +
      '%"></span></div>' +
      '<span>Section ' +
      secNum +
      '/' +
      secTotal +
      ' · ' +
      stats.answered +
      '/' +
      stats.total +
      ' answered</span>' +
      '</div></div>'
    );
  }

  function orderedSections() {
    return Object.keys(state.sectionsById)
      .map(function (id) { return state.sectionsById[id]; })
      .sort(function (a, b) {
        return (metaVal(a, 'poll_number') || 0) - (metaVal(b, 'poll_number') || 0);
      });
  }

  function renderToc() {
    var statsAll = overallAnswerStats();
    var html = '';
    html += '<div class="pp-toolbar">' + tocToggleButton() + '</div>';
    html += '<h2 class="pp-toc-heading">Contents &amp; progress</h2>';
    html +=
      '<p class="pp-muted pp-toc-summary">' +
      statsAll.answered +
      ' of ' +
      statsAll.total +
      ' answerable questions completed (' +
      (statsAll.total ? Math.round((statsAll.answered / statsAll.total) * 100) : 0) +
      '%)</p>';
    function filterPill(key, cls, label) {
      var on = state.tocFilters[key];
      return (
        '<button type="button" class="pp-toc-pill ' +
        cls +
        (on ? ' pp-toc-filter-on' : '') +
        '" data-toc-filter="' +
        key +
        '" aria-pressed="' +
        (on ? 'true' : 'false') +
        '" title="Toggle filter">' +
        label +
        '</button>'
      );
    }
    html +=
      '<p class="pp-toc-legend">' +
      filterPill('answered', 'pp-toc-answered', 'Answered') +
      filterPill('pending', 'pp-toc-pending', 'Not answered') +
      filterPill('instructions', 'pp-toc-instructions', 'Instructions') +
      '<span class="pp-toc-pill pp-toc-current-mark" title="Highlight only — not a filter">Current</span>' +
      '</p>';
    if (tocFiltersActive()) {
      html +=
        '<p class="pp-muted pp-toc-filter-hint">Showing filtered items — click pills again to adjust (none selected = all).</p>';
    }

    orderedSections().forEach(function (section) {
      var st = sectionStats(section.sharedId);
      var pct = st.total ? Math.round((st.answered / st.total) * 100) : 0;
      var sectionItemsHtml = '';
      var visibleCount = 0;
      state.items.forEach(function (item, idx) {
        if (item.section.sharedId !== section.sharedId) return;
        var q = item.question;
        var status = tocItemStatus(q);
        if (!tocItemVisible(status)) return;
        visibleCount += 1;
        var type = questionType(q);
        var current = idx === state.index;
        var cls = 'pp-toc-item';
        if (status === 'instructions') cls += ' pp-toc-instructions';
        else if (status === 'answered') cls += ' pp-toc-answered';
        else cls += ' pp-toc-pending';
        if (current) cls += ' pp-toc-current';
        var num = metaVal(q, 'poll_number') || '';
        var prefix = type === 'instructions' ? 'Info' : 'Q' + num;
        sectionItemsHtml +=
          '<li class="pp-toc-item-wrap"><button type="button" class="' +
          cls +
          '" data-index="' +
          idx +
          '"><span class="pp-toc-num">' +
          escapeHtml(prefix) +
          '</span><span class="pp-toc-label">' +
          escapeHtml(shortQuestionLabel(q)) +
          '</span></button></li>';
      });
      if (!visibleCount) return;
      html += '<section class="pp-toc-section">';
      html +=
        '<div class="pp-toc-section-head">' +
        '<button type="button" class="pp-toc-section-link" data-section="' +
        escapeHtml(section.sharedId) +
        '">' +
        escapeHtml('Section ' + (metaVal(section, 'poll_number') || '') + ' — ' + section.title) +
        '</button>' +
        '<span class="pp-toc-section-stats">' +
        st.answered +
        '/' +
        st.total +
        '</span></div>';
      html +=
        '<div class="pp-toc-section-bar"><span style="width:' +
        pct +
        '%"></span></div>';
      html += '<ul class="pp-toc-list">' + sectionItemsHtml + '</ul></section>';
    });

    renderShell(html);
    bindTocChrome();
  }

  function bindTocChrome() {
    bindGuidanceLink();
    var toggle = document.getElementById('pp-toc-toggle');
    if (toggle) {
      toggle.addEventListener('click', function () {
        closeGuidanceModal();
        state.tocOpen = !state.tocOpen;
        if (state.tocOpen) renderToc();
        else renderQuestion();
      });
    }
    var filterBtns = cardEl.querySelectorAll('[data-toc-filter]');
    for (var f = 0; f < filterBtns.length; f++) {
      filterBtns[f].addEventListener('click', function (ev) {
        var key = ev.currentTarget.getAttribute('data-toc-filter');
        if (!key || !Object.prototype.hasOwnProperty.call(state.tocFilters, key)) return;
        state.tocFilters[key] = !state.tocFilters[key];
        renderToc();
      });
    }
    var sectionLinks = cardEl.querySelectorAll('.pp-toc-section-link');
    for (var i = 0; i < sectionLinks.length; i++) {
      sectionLinks[i].addEventListener('click', function (ev) {
        var sid = ev.currentTarget.getAttribute('data-section');
        for (var j = 0; j < state.items.length; j++) {
          if (state.items[j].section.sharedId === sid) {
            state.index = j;
            state.tocOpen = false;
            renderQuestion();
            return;
          }
        }
      });
    }
    var items = cardEl.querySelectorAll('.pp-toc-item');
    for (var k = 0; k < items.length; k++) {
      items[k].addEventListener('click', function (ev) {
        var idx = Number(ev.currentTarget.getAttribute('data-index'));
        if (!Number.isNaN(idx)) {
          state.index = idx;
          state.tocOpen = false;
          renderQuestion();
        }
      });
    }
  }

  function renderView() {
    if (state.tocOpen) renderToc();
    else renderQuestion();
  }

  function optionInputs(q, existing) {
    var opts = metaList(q, 'poll_available_options');
    var multi = allowMultiple(q);
    var selected = {};
    metaList(existing, 'poll_selected_options').forEach(function (o) {
      if (o && o.value !== undefined) selected[o.value] = true;
    });
    var html = '<ul class="pp-options">';
    opts.forEach(function (o, idx) {
      var id = 'pp-opt-' + idx;
      var inputType = multi ? 'checkbox' : 'radio';
      var checked = selected[o.value] ? ' checked' : '';
      html +=
        '<li><label for="' +
        id +
        '"><input id="' +
        id +
        '" type="' +
        inputType +
        '" name="pp-option" value="' +
        o.value +
        '"' +
        checked +
        ' /><span>' +
        escapeHtml(o.label || o.value) +
        '</span></label></li>';
    });
    html += '</ul>';
    return html;
  }

  function readForm(q) {
    var type = questionType(q);
    var result = { options: [], text: '', numeric: null };
    if (type === 'choice' || type === 'choice_and_text') {
      var inputs = root.querySelectorAll('input[name="pp-option"]:checked');
      for (var i = 0; i < inputs.length; i++) result.options.push(inputs[i].value);
    }
    if (type === 'free_text' || type === 'choice_and_text') {
      var ta = root.querySelector('#pp-text');
      result.text = ta ? ta.value.trim() : '';
    }
    if (type === 'numeric') {
      var num = root.querySelector('#pp-numeric');
      result.numeric = num && num.value !== '' ? Number(num.value) : null;
    }
    return result;
  }

  function validate(q, form) {
    var type = questionType(q);
    if (type === 'instructions') return null;
    if (type === 'choice' || type === 'choice_and_text') {
      if (!form.options.length) return 'Please select an option.';
    }
    if (type === 'free_text' && !form.text) return 'Please enter an answer.';
    if (type === 'numeric' && (form.numeric === null || Number.isNaN(form.numeric))) {
      return 'Please enter a number.';
    }
    return null;
  }

  function renderQuestion() {
    if (state.done) {
      renderShell(
        '<div class="pp-done">' +
          '<h2>Thank you</h2>' +
          '<p class="pp-done-message">Your answers for <strong>' +
          escapeHtml(state.poll.title) +
          '</strong> have been accepted.</p>' +
          '<p class="pp-done-hint">If you need to revisit or change your answers later, contact an administrator.</p>' +
          '</div>'
      );
      return;
    }

    var item = currentItem();
    var q = item.question;
    var section = item.section;
    var type = questionType(q);
    var existing = state.answersByQuestion[q.sharedId];
    var qText = metaVal(q, 'poll_question_text') || q.title;
    var html = '';
    html += sectionGuidanceLinkHtml();

    html +=
      '<p class="pp-section">' +
      escapeHtml('Section ' + (metaVal(section, 'poll_number') || '') + ' — ' + section.title) +
      '</p>';
    html += progressHtml();

    if (type === 'instructions') {
      html += '<p class="pp-muted pp-guidance-note">These are instructions for the section — no answer required.</p>';
      html += '<div class="pp-instructions"><div class="pp-qtext">' + escapeHtml(qText) + '</div></div>';
    } else {
      html +=
        '<p class="pp-qnum">Question ' +
        (metaVal(q, 'poll_number') || '') +
        ' in this section</p>';
      html += '<p class="pp-qtext">' + escapeHtml(qText) + '</p>';

      if (type === 'choice' || type === 'choice_and_text') {
        html += optionInputs(q, existing);
      }
      if (type === 'numeric') {
        var nval = metaVal(existing, 'poll_numeric');
        if (nval === undefined) nval = '';
        html +=
          '<div class="pp-field"><label for="pp-numeric">Your answer</label>' +
          '<input id="pp-numeric" type="number" value="' +
          escapeHtml(nval) +
          '" /></div>';
      }
      if (type === 'free_text' || type === 'choice_and_text') {
        var tval = metaVal(existing, 'poll_text') || '';
        var prompt = metaVal(q, 'poll_text_prompt') || (type === 'choice_and_text' ? 'Additional comments (optional)' : 'Your answer');
        var requiredNote = type === 'free_text' ? '' : ' <span class="pp-muted">(optional)</span>';
        html +=
          '<div class="pp-field"><label for="pp-text">' +
          escapeHtml(prompt) +
          requiredNote +
          '</label>' +
          '<textarea id="pp-text">' +
          escapeHtml(tval) +
          '</textarea></div>';
      }
    }

    html += '<p class="pp-error" id="pp-err" hidden></p>';
    html += '<div class="pp-actions">';
    html +=
      '<button type="button" id="pp-prev"' +
      (state.index === 0 ? ' disabled' : '') +
      '>Previous</button>';
    var isLast = state.index === state.items.length - 1;
    var canSkip = !isLast && isAnswerable(q);
    html += '<div class="pp-actions-end">';
    if (canSkip) {
      html +=
        '<button type="button" class="pp-skip" id="pp-skip" title="Leave unanswered and go to the next item">Skip</button>';
    }
    if (isLast) {
      html += '<button type="button" class="primary" id="pp-accept">Accept &amp; finish</button>';
    } else {
      html += '<button type="button" class="primary" id="pp-next">Next</button>';
    }
    html += '</div></div>';

    renderShell(html);

    var errEl = document.getElementById('pp-err');
    function showErr(msg) {
      if (!errEl) return;
      if (msg) {
        errEl.hidden = false;
        errEl.textContent = msg;
      } else {
        errEl.hidden = true;
        errEl.textContent = '';
      }
    }

    function formHasInput(form) {
      if (form.options && form.options.length) return true;
      if (form.text) return true;
      if (form.numeric !== null && form.numeric !== undefined && !Number.isNaN(form.numeric)) {
        return true;
      }
      return false;
    }

    var prev = document.getElementById('pp-prev');
    if (prev) {
      prev.addEventListener('click', function () {
        if (state.index > 0) {
          state.index -= 1;
          renderQuestion();
        }
      });
    }

    /** @param {{ allowEmpty?: boolean }} [opts] */
    async function saveCurrent(opts) {
      opts = opts || {};
      if (!isAnswerable(q)) return true;
      var form = readForm(q);
      if (opts.allowEmpty && !formHasInput(form)) {
        showErr(null);
        return true;
      }
      var err = validate(q, form);
      if (err) {
        showErr(err);
        return false;
      }
      showErr(null);
      setBusy(true);
      try {
        await upsertAnswer(q, form);
        return true;
      } catch (e) {
        showErr(e.message || String(e));
        return false;
      } finally {
        setBusy(false);
      }
    }

    function unansweredCount() {
      var stats = overallAnswerStats();
      return stats.total - stats.answered;
    }

    var skip = document.getElementById('pp-skip');
    if (skip) {
      skip.addEventListener('click', function () {
        showErr(null);
        state.index += 1;
        renderQuestion();
      });
    }

    var next = document.getElementById('pp-next');
    if (next) {
      next.addEventListener('click', async function () {
        if (await saveCurrent()) {
          state.index += 1;
          renderQuestion();
        }
      });
    }

    var accept = document.getElementById('pp-accept');
    if (accept) {
      accept.addEventListener('click', async function () {
        // Save if they filled something; otherwise leave this question unanswered.
        if (!(await saveCurrent({ allowEmpty: true }))) return;
        var left = unansweredCount();
        var msg =
          'Once finished, you will not be able to change answers unless an administrator reopens the session.';
        if (left > 0) {
          msg =
            (left === 1
              ? '1 question is still unanswered. '
              : left + ' questions are still unanswered. ') +
            'Finish anyway? ' +
            msg;
        }
        var ok = await openConfirmModal({
          title: 'Finish this session?',
          message: msg,
          confirmLabel: 'Accept & finish',
          cancelLabel: 'Keep editing',
        });
        if (!ok) return;
        setBusy(true);
        try {
          await acceptSession();
          state.done = true;
          renderQuestion();
        } catch (e) {
          showErr(e.message || String(e));
        } finally {
          setBusy(false);
        }
      });
    }

    bindTocChrome();
  }

  function buildAnswerMetadata(q, form) {
    var type = questionType(q);
    var metadata = {
      poll_session: [{ value: state.session.sharedId }],
      poll_question: [{ value: q.sharedId }],
    };
    if ((type === 'choice' || type === 'choice_and_text') && form.options.length) {
      metadata.poll_selected_options = form.options.map(function (v) {
        return { value: v };
      });
    }
    if ((type === 'free_text' || type === 'choice_and_text') && form.text) {
      metadata.poll_text = [{ value: form.text }];
    }
    if (type === 'numeric' && form.numeric !== null) {
      metadata.poll_numeric = [{ value: form.numeric }];
    }
    return metadata;
  }

  async function upsertAnswer(q, form) {
    var existing = state.answersByQuestion[q.sharedId];
    var metadata = buildAnswerMetadata(q, form);
    var title =
      'S' +
      (metaVal(currentItem().section, 'poll_number') || '') +
      ' Q' +
      (metaVal(q, 'poll_number') || '');
    var payload = {
      title: title,
      template: CONFIG.templates.Answer,
      metadata: metadata,
      published: false,
      language: 'en',
    };
    if (existing) {
      payload._id = existing._id;
      payload.sharedId = existing.sharedId;
    }
    var saved = await api('POST', '/api/entities', payload);
    var entity = saved.entity || saved;
    state.answersByQuestion[q.sharedId] = entity;
    return entity;
  }

  async function acceptSession() {
    var metadata = {
      poll_poll: [{ value: state.pollId }],
      poll_session_status: [{ value: CONFIG.sessionStatus.accepted }],
      poll_respondent: [
        {
          value:
            metaVal(state.session, 'poll_respondent') ||
            (state.user && state.user.username) ||
            '',
        },
      ],
      poll_accepted_at: [{ value: Math.floor(Date.now() / 1000) }],
    };
    var token = metaVal(state.session, 'poll_token');
    if (token) metadata.poll_token = [{ value: token }];
    var payload = {
      _id: state.session._id,
      sharedId: state.session.sharedId,
      title: state.session.title,
      template: CONFIG.templates.Session,
      published: false,
      language: 'en',
      metadata: metadata,
    };
    var saved = await api('POST', '/api/entities', payload);
    state.session = saved.entity || saved;
  }

  async function loadEntity(sharedId) {
    var data = await api('GET', '/api/entities?sharedId=' + encodeURIComponent(sharedId));
    var rows = data.rows || (Array.isArray(data) ? data : [data]);
    return rows[0];
  }

  async function searchByTemplate(templateId) {
    var url =
      '/api/search?types=' +
      encodeURIComponent(JSON.stringify([templateId])) +
      '&includeUnpublished=true&limit=3000';
    var data = await api('GET', url);
    return data.rows || [];
  }

  async function loadSessionByToken(token) {
    var sessions = await searchByTemplate(CONFIG.templates.Session);
    var match = sessions.find(function (s) {
      return (
        metaVal(s, 'poll_poll') === state.pollId &&
        String(metaVal(s, 'poll_token') || '') === String(token)
      );
    });
    if (!match) {
      throw new Error(
        'No session found for this poll and token. Ask an admin for a valid session link.'
      );
    }
    state.session = match;
    if (metaVal(state.session, 'poll_session_status') === CONFIG.sessionStatus.accepted) {
      state.done = true;
    }
  }

  async function loadAnswers() {
    var answers = await searchByTemplate(CONFIG.templates.Answer);
    state.answersByQuestion = {};
    answers.forEach(function (a) {
      if (metaVal(a, 'poll_session') === state.session.sharedId) {
        var qid = metaVal(a, 'poll_question');
        if (qid) state.answersByQuestion[qid] = a;
      }
    });
  }

  function buildItems(sections, questions) {
    state.sectionsById = {};
    sections.forEach(function (s) {
      state.sectionsById[s.sharedId] = s;
    });

    var items = questions
      .filter(function (q) {
        return metaVal(q, 'poll_poll') === state.pollId;
      })
      .map(function (q) {
        var sid = metaVal(q, 'poll_section');
        return { question: q, section: state.sectionsById[sid] };
      })
      .filter(function (item) {
        return item.section;
      });

    items.sort(function (a, b) {
      var sn =
        (metaVal(a.section, 'poll_number') || 0) - (metaVal(b.section, 'poll_number') || 0);
      if (sn !== 0) return sn;
      return (metaVal(a.question, 'poll_number') || 0) - (metaVal(b.question, 'poll_number') || 0);
    });
    return items;
  }


  async function loadSiteName() {
    try {
      var settings = await api('GET', '/api/settings');
      var name = (settings && (settings.site_name || settings.siteName)) || '';
      return String(name || '').trim() || 'Uwazi';
    } catch (e) {
      return 'Uwazi';
    }
  }

  function renderSorryPage(opts) {
    opts = opts || {};
    var site = opts.siteName || 'Uwazi';
    var title = opts.title || "We couldn't open this poll";
    var message = opts.message || '';
    var hint = opts.hint || '';
    var html = '';
    html += '<div class="pp-sorry">';
    html += '<p class="pp-sorry-brand">' + escapeHtml(site) + '</p>';
    html += '<h2 class="pp-sorry-title">' + escapeHtml(title) + '</h2>';
    if (message) {
      html += '<p class="pp-sorry-message">' + escapeHtml(message) + '</p>';
    }
    if (hint) {
      html += '<p class="pp-sorry-hint">' + escapeHtml(hint) + '</p>';
    }
    html += '</div>';
    setPollTitle(null);
    renderShell(html);
  }

  async function init() {
    var params = new URLSearchParams(window.location.search);
    state.pollId = params.get('poll') || '';
    state.token = params.get('token') || '';
    if (!state.pollId || !state.token) {
      var siteMissing = await loadSiteName();
      var missingBits = [];
      if (!state.pollId) missingBits.push('poll id');
      if (!state.token) missingBits.push('session token');
      renderSorryPage({
        siteName: siteMissing,
        title: "We couldn't open this poll",
        message:
          'This link is missing a ' +
          missingBits.join(' and a ') +
          '. Polls can only be opened from a session invite.',
        hint: 'Ask your administrator for a link from Poll admin → Sessions (it includes both poll and token).',
      });
      return;
    }

    state.user = getUser();
    if (!state.user || !state.user._id) {
      var siteLogin = await loadSiteName();
      renderSorryPage({
        siteName: siteLogin,
        title: 'Sign in to continue',
        message: 'You need to be logged in to answer this poll.',
        hint: 'Log in to this collection, then open your session link again.',
      });
      return;
    }

    renderShell('<p class="pp-muted">Loading poll…</p>');

    try {
      await resolveConfigFromInstance();

      state.poll = await loadEntity(state.pollId);
      if (!state.poll) throw new Error('Poll not found.');
      setPollTitle(state.poll.title);

      var sections = (await searchByTemplate(CONFIG.templates.Section)).filter(function (s) {
        return metaVal(s, 'poll_poll') === state.pollId;
      });
      var questions = await searchByTemplate(CONFIG.templates.Question);
      state.items = buildItems(sections, questions);

      if (!state.items.length) {
        var siteEmpty = await loadSiteName();
        renderSorryPage({
          siteName: siteEmpty,
          title: 'This poll is empty',
          message: 'There are no questions to answer yet.',
          hint: 'Check back later, or ask your administrator if you expected content here.',
        });
        return;
      }

      await loadSessionByToken(state.token);
      await loadAnswers();

      if (!state.done) {
        var resume = 0;
        for (var i = 0; i < state.items.length; i++) {
          var q = state.items[i].question;
          if (!isAnswerable(q)) continue;
          if (!state.answersByQuestion[q.sharedId]) {
            resume = i;
            break;
          }
          resume = i;
        }
        state.index = resume;
      }

      renderQuestion();
    } catch (e) {
      var siteErr = await loadSiteName();
      var msg = e.message || String(e);
      renderSorryPage({
        siteName: siteErr,
        title: "We couldn't open this poll",
        message: msg,
        hint: 'If you were given a session link, confirm it is complete and still valid, or ask your administrator for a new one.',
      });
    }
  }

  init();
})();
