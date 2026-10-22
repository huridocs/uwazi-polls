/**
 * SurveyMonkey /surveys/{id}/details mapping used by Poll admin import/export.
 * UMD: Node tests require() this file; the published admin page concatenates it
 * ahead of admin/script.js (see scripts/seed-pages.mjs).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (typeof root === 'object') {
    root.PollSmDetails = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function stripHtml(html) {
    var s = String(html || '');
    s = s.replace(/<br\s*\/?>/gi, '\n');
    s = s.replace(/<\/p>/gi, '\n');
    s = s.replace(/<[^>]+>/g, '');
    s = s
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
    return s.replace(/\n{3,}/g, '\n\n').trim();
  }

  function mapSmQuestion(q, warnings) {
    warnings = warnings || [];
    var fam = q.family || '';
    var sub = q.subtype || '';
    var heading = '';
    if (q.headings && q.headings[0]) {
      heading = stripHtml(q.headings[0].heading || '');
    }
    var required = !!(q.required && q.required.type);
    var item = {
      smId: q.id,
      heading: heading || '(untitled)',
      required: required,
      family: fam,
      subtype: sub,
      skip: false,
      kind: null,
      allowMultiple: false,
      choices: [],
    };
    if (fam === 'presentation') {
      item.kind = 'instructions';
      return item;
    }
    if (fam === 'single_choice') {
      item.kind = 'choice';
      item.allowMultiple = false;
      item.choices = ((q.answers && q.answers.choices) || []).map(function (c) {
        return { smId: c.id, text: stripHtml(c.text || '') };
      });
      return item;
    }
    if (fam === 'multiple_choice') {
      item.kind = 'choice';
      item.allowMultiple = true;
      item.choices = ((q.answers && q.answers.choices) || []).map(function (c) {
        return { smId: c.id, text: stripHtml(c.text || '') };
      });
      return item;
    }
    if (fam === 'open_ended') {
      if (sub === 'numerical' || sub === 'numeric') {
        item.kind = 'numeric';
      } else {
        item.kind = 'free_text';
      }
      return item;
    }
    // SurveyMonkey date/time questions — we only support a single calendar date.
    if (fam === 'datetime') {
      item.kind = 'date';
      return item;
    }
    item.skip = true;
    item.kind = null;
    warnings.push(
      'Skipped SM question ' +
        (q.id || '') +
        ' (' +
        fam +
        '/' +
        sub +
        '): ' +
        (heading || '').slice(0, 60)
    );
    return item;
  }

  function buildImportPreviewFromSmDetails(details) {
    var warnings = [];
    var sections = (details.pages || []).map(function (page, idx) {
      var items = (page.questions || []).map(function (q) {
        return mapSmQuestion(q, warnings);
      });
      return {
        smId: page.id,
        title: stripHtml(page.title || 'Section ' + (idx + 1)),
        items: items,
      };
    });
    var stats = {
      sections: sections.length,
      items: 0,
      choice: 0,
      multi: 0,
      text: 0,
      numeric: 0,
      date: 0,
      guidance: 0,
      skipped: 0,
    };
    sections.forEach(function (sec) {
      sec.items.forEach(function (it) {
        stats.items += 1;
        if (it.skip) stats.skipped += 1;
        else if (it.kind === 'instructions') stats.guidance += 1;
        else if (it.kind === 'choice' && it.allowMultiple) stats.multi += 1;
        else if (it.kind === 'choice') stats.choice += 1;
        else if (it.kind === 'numeric') stats.numeric += 1;
        else if (it.kind === 'date') stats.date += 1;
        else if (it.kind === 'free_text') stats.text += 1;
      });
    });
    return {
      title: details.title || details.nickname || 'Imported poll',
      nickname: details.nickname || '',
      smSurveyId: details.id,
      sections: sections,
      stats: stats,
      warnings: warnings,
      source: 'sm',
    };
  }

  /**
   * Build a SurveyMonkey-compatible /details payload from a poll structure.
   * @param {{
   *   title: string,
   *   sharedId?: string,
   *   sections: Array<{
   *     sharedId?: string,
   *     title: string,
   *     questions: Array<{
   *       sharedId?: string,
   *       text: string,
   *       kind: string,
   *       allowMultiple?: boolean,
   *       choices?: Array<{ sharedId?: string, text: string }>
   *     }>
   *   }>
   * }} poll
   */
  function exportPollToSmDetails(poll) {
    poll = poll || {};
    var pages = (poll.sections || []).map(function (sec, sIdx) {
      var questions = (sec.questions || []).map(function (q, qIdx) {
        var kind = q.kind || 'free_text';
        var family = 'open_ended';
        var subtype = 'essay';
        if (kind === 'instructions') {
          family = 'presentation';
          subtype = 'descriptive_text';
        } else if (kind === 'choice' || kind === 'choice_and_text') {
          family = q.allowMultiple ? 'multiple_choice' : 'single_choice';
          subtype = q.allowMultiple ? 'vertical' : 'vertical';
        } else if (kind === 'numeric') {
          family = 'open_ended';
          subtype = 'numerical';
        } else if (kind === 'date') {
          family = 'datetime';
          subtype = 'date_only';
        } else {
          family = 'open_ended';
          subtype = 'essay';
        }
        var out = {
          id: q.sharedId || 'q' + (sIdx + 1) + '_' + (qIdx + 1),
          family: family,
          subtype: subtype,
          headings: [{ heading: q.text || '' }],
        };
        if (family === 'single_choice' || family === 'multiple_choice') {
          out.answers = {
            choices: (q.choices || []).map(function (c, cIdx) {
              return {
                id: c.sharedId || 'c' + (sIdx + 1) + '_' + (qIdx + 1) + '_' + (cIdx + 1),
                text: c.text || '',
              };
            }),
          };
        }
        return out;
      });
      return {
        id: sec.sharedId || 'page' + (sIdx + 1),
        title: sec.title || 'Section ' + (sIdx + 1),
        questions: questions,
      };
    });
    return {
      title: poll.title || 'Exported poll',
      id: poll.sharedId || undefined,
      pages: pages,
    };
  }

  return {
    stripHtml: stripHtml,
    mapSmQuestion: mapSmQuestion,
    buildImportPreviewFromSmDetails: buildImportPreviewFromSmDetails,
    exportPollToSmDetails: exportPollToSmDetails,
  };
});
