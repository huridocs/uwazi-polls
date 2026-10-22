const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const SM = require('../../lib/sm-details.js');

describe('PollSmDetails', () => {
  it('maps presentation → instructions', () => {
    const warnings = [];
    const item = SM.mapSmQuestion(
      {
        id: '1',
        family: 'presentation',
        subtype: 'descriptive_text',
        headings: [{ heading: 'Hello <b>there</b>' }],
      },
      warnings
    );
    assert.equal(item.kind, 'instructions');
    assert.equal(item.heading, 'Hello there');
    assert.equal(warnings.length, 0);
  });

  it('maps single_choice and multiple_choice', () => {
    const single = SM.mapSmQuestion({
      id: '2',
      family: 'single_choice',
      headings: [{ heading: 'Pick' }],
      answers: { choices: [{ id: 'a', text: 'Yes' }] },
    });
    assert.equal(single.kind, 'choice');
    assert.equal(single.allowMultiple, false);
    assert.equal(single.choices[0].text, 'Yes');

    const multi = SM.mapSmQuestion({
      id: '3',
      family: 'multiple_choice',
      headings: [{ heading: 'Pick many' }],
      answers: { choices: [{ id: 'b', text: 'A' }, { id: 'c', text: 'B' }] },
    });
    assert.equal(multi.kind, 'choice');
    assert.equal(multi.allowMultiple, true);
    assert.equal(multi.choices.length, 2);
  });

  it('maps open_ended numeric vs text', () => {
    assert.equal(
      SM.mapSmQuestion({
        id: '4',
        family: 'open_ended',
        subtype: 'numerical',
        headings: [{ heading: 'Age' }],
      }).kind,
      'numeric'
    );
    assert.equal(
      SM.mapSmQuestion({
        id: '5',
        family: 'open_ended',
        subtype: 'essay',
        headings: [{ heading: 'Why' }],
      }).kind,
      'free_text'
    );
  });

  it('skips unknown families with a warning', () => {
    const warnings = [];
    const item = SM.mapSmQuestion(
      { id: '9', family: 'matrix', subtype: 'single', headings: [{ heading: 'Grid' }] },
      warnings
    );
    assert.equal(item.skip, true);
    assert.equal(warnings.length, 1);
  });

  it('buildImportPreviewFromSmDetails aggregates stats', () => {
    const preview = SM.buildImportPreviewFromSmDetails({
      title: 'Demo',
      id: 'sid',
      pages: [
        {
          id: 'p1',
          title: 'Sec',
          questions: [
            {
              id: 'q1',
              family: 'presentation',
              headings: [{ heading: 'Info' }],
            },
            {
              id: 'q2',
              family: 'single_choice',
              headings: [{ heading: 'Q' }],
              answers: { choices: [{ id: 'c1', text: 'Y' }] },
            },
          ],
        },
      ],
    });
    assert.equal(preview.title, 'Demo');
    assert.equal(preview.stats.sections, 1);
    assert.equal(preview.stats.guidance, 1);
    assert.equal(preview.stats.choice, 1);
    assert.equal(preview.sections[0].items.length, 2);
  });

  it('export → import round-trips kinds', () => {
    const details = SM.exportPollToSmDetails({
      title: 'Round trip',
      sharedId: 'poll1',
      sections: [
        {
          sharedId: 'sec1',
          title: 'Alpha',
          questions: [
            {
              sharedId: 'q1',
              text: 'Welcome',
              kind: 'instructions',
            },
            {
              sharedId: 'q2',
              text: 'Pick',
              kind: 'choice',
              allowMultiple: false,
              choices: [
                { sharedId: 'o1', text: 'Yes' },
                { sharedId: 'o2', text: 'No' },
              ],
            },
            {
              sharedId: 'q3',
              text: 'Number',
              kind: 'numeric',
            },
            {
              sharedId: 'q4',
              text: 'Comment',
              kind: 'free_text',
            },
          ],
        },
      ],
    });

    assert.equal(details.title, 'Round trip');
    assert.equal(details.pages.length, 1);
    assert.equal(details.pages[0].questions.length, 4);

    const preview = SM.buildImportPreviewFromSmDetails(details);
    const kinds = preview.sections[0].items.map(i => i.kind);
    assert.deepEqual(kinds, ['instructions', 'choice', 'numeric', 'free_text']);
    assert.equal(preview.sections[0].items[1].choices.length, 2);
    assert.equal(preview.stats.skipped, 0);
  });
});
