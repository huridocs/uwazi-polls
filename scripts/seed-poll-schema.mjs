#!/usr/bin/env node
/**
 * Create [Poll]* relation types, thesauri, and templates on a blank Uwazi.
 * Mirrors admin Configuration → Create the template structure (without UI confirm).
 */
import { withSession } from './lib/uwazi-api.mjs';

const NS = '[Poll] ';

const EXPECTED_RELATION_TYPES = [
  { key: 'belongs', name: NS + 'belongs to' },
  { key: 'hasOption', name: NS + 'has option' },
  { key: 'selected', name: NS + 'selected option' },
];

const EXPECTED_THESAURI = [
  {
    key: 'pollStatus',
    name: NS + 'Poll status',
    values: [{ label: 'draft' }, { label: 'published' }, { label: 'closed' }],
  },
  {
    key: 'qType',
    name: NS + 'Question type',
    values: [
      { label: 'choice' },
      { label: 'free_text' },
      { label: 'numeric' },
      { label: 'date' },
      { label: 'choice_and_text' },
      { label: 'instructions' },
    ],
  },
  {
    key: 'yesNo',
    name: NS + 'Yes No',
    values: [{ label: 'yes' }, { label: 'no' }],
  },
  {
    key: 'sessionStatus',
    name: NS + 'Session status',
    values: [{ label: 'in_progress' }, { label: 'accepted' }],
  },
];

const EXPECTED_TEMPLATES = [
  {
    key: 'Option',
    name: NS + 'Option',
    properties: [{ label: 'Poll label', type: 'text' }],
  },
  {
    key: 'Poll',
    name: NS + 'Poll',
    properties: [
      { label: 'Poll description', type: 'markdown' },
      { label: 'Poll status', type: 'select', thesaurus: 'pollStatus', filter: true },
    ],
  },
  {
    key: 'Section',
    name: NS + 'Section',
    properties: [
      { label: 'Poll number', type: 'numeric', filter: true },
      { label: 'Poll description', type: 'markdown' },
      {
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
      { label: 'Poll number', type: 'numeric' },
      { label: 'Poll question text', type: 'markdown' },
      { label: 'Poll type', type: 'select', thesaurus: 'qType', filter: true },
      { label: 'Poll allow multiple', type: 'select', thesaurus: 'yesNo', filter: true },
      { label: 'Poll text prompt', type: 'text' },
      {
        label: 'Poll section',
        type: 'relationship',
        contentKey: 'Section',
        relationTypeKey: 'belongs',
        filter: true,
      },
      {
        label: 'Poll poll',
        type: 'relationship',
        contentKey: 'Poll',
        relationTypeKey: 'belongs',
        filter: true,
      },
      {
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
        label: 'Poll poll',
        type: 'relationship',
        contentKey: 'Poll',
        relationTypeKey: 'belongs',
        filter: true,
      },
      { label: 'Poll session status', type: 'select', thesaurus: 'sessionStatus', filter: true },
      { label: 'Poll respondent', type: 'text' },
      { label: 'Poll accepted at', type: 'date' },
      { label: 'Poll token', type: 'text' },
      { label: 'Poll answered count', type: 'numeric' },
      { label: 'Poll question count', type: 'numeric' },
    ],
  },
  {
    key: 'Answer',
    name: NS + 'Answer',
    properties: [
      {
        label: 'Poll session',
        type: 'relationship',
        contentKey: 'Session',
        relationTypeKey: 'belongs',
        filter: true,
      },
      {
        label: 'Poll question',
        type: 'relationship',
        contentKey: 'Question',
        relationTypeKey: 'belongs',
        filter: true,
      },
      {
        label: 'Poll selected options',
        type: 'relationship',
        contentKey: 'Option',
        relationTypeKey: 'selected',
        filter: true,
      },
      { label: 'Poll text', type: 'text' },
      { label: 'Poll numeric', type: 'numeric' },
      { label: 'Poll date', type: 'date' },
    ],
  },
];

function findByName(rows, name) {
  return (rows || []).find(r => r.name === name);
}

function commonPropertiesSeed() {
  return [
    { label: 'Title', name: 'title', type: 'text', isCommonProperty: true, prioritySorting: false },
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

await withSession(async api => {
  const ids = { relationTypes: {}, thesauri: {}, templates: {} };

  async function loadRelationTypes() {
    const data = await api('GET', '/api/relationtypes');
    return data.rows || data;
  }
  async function loadThesauri() {
    const data = await api('GET', '/api/thesauris');
    return data.rows || data;
  }
  async function loadTemplates() {
    const data = await api('GET', '/api/templates');
    return data.rows || data;
  }

  for (const spec of EXPECTED_RELATION_TYPES) {
    const rows = await loadRelationTypes();
    let found = findByName(rows, spec.name);
    if (!found) {
      found = await api('POST', '/api/relationtypes', { name: spec.name });
      console.log('created relation type', spec.name);
    }
    ids.relationTypes[spec.key] = found._id;
  }

  for (const spec of EXPECTED_THESAURI) {
    let rows = await loadThesauri();
    let found = findByName(rows, spec.name);
    if (!found) {
      found = await api('POST', '/api/thesauris', {
        name: spec.name,
        values: spec.values.map(v => ({ label: v.label })),
      });
      console.log('created thesaurus', spec.name);
    } else {
      const have = new Set((found.values || []).map(v => v.label));
      const missing = spec.values.filter(v => !have.has(v.label));
      if (missing.length) {
        found = await api('POST', '/api/thesauris', {
          _id: found._id,
          name: found.name,
          values: [...(found.values || []), ...missing.map(v => ({ label: v.label }))],
        });
        console.log('updated thesaurus', spec.name);
      }
    }
    ids.thesauri[spec.key] = found._id;
  }

  function propertyPayload(want) {
    const p = {
      label: want.label,
      type: want.type,
      required: false,
      showInCard: false,
      filter: !!want.filter,
    };
    if (want.type === 'select' && want.thesaurus) {
      p.content = ids.thesauri[want.thesaurus];
    }
    if (want.type === 'relationship') {
      p.content = ids.templates[want.contentKey];
      p.relationType = ids.relationTypes[want.relationTypeKey];
    }
    return p;
  }

  // Create templates in order (relationships need target template ids).
  for (const spec of EXPECTED_TEMPLATES) {
    const rows = await loadTemplates();
    let found = findByName(rows, spec.name);
    if (!found) {
      // First pass may miss relationship content if dependent template not yet created —
      // create with whatever wiring is already known, then fix on a second pass.
      const props = spec.properties.map(propertyPayload).filter(p => {
        if (p.type === 'relationship' && (!p.content || !p.relationType)) return false;
        if (p.type === 'select' && !p.content) return false;
        return true;
      });
      found = await api('POST', '/api/templates', {
        name: spec.name,
        color: '#9ca3af',
        commonProperties: commonPropertiesSeed(),
        properties: props,
      });
      console.log('created template', spec.name);
    }
    ids.templates[spec.key] = found._id || found;
    if (typeof ids.templates[spec.key] === 'object') {
      ids.templates[spec.key] = found._id;
    }
  }

  // Second pass: ensure all properties exist with correct wiring.
  for (const spec of EXPECTED_TEMPLATES) {
    const rows = await loadTemplates();
    const tpl = findByName(rows, spec.name);
    if (!tpl) throw new Error('missing template ' + spec.name);
    ids.templates[spec.key] = tpl._id;
    const byLabel = new Map((tpl.properties || []).map(p => [p.label, p]));
    let changed = false;
    const nextProps = (tpl.properties || []).map(p => ({ ...p }));
    for (const want of spec.properties) {
      const payload = propertyPayload(want);
      if (want.type === 'relationship' && (!payload.content || !payload.relationType)) {
        throw new Error(`unresolved relationship for ${spec.name}.${want.label}`);
      }
      if (want.type === 'select' && !payload.content) {
        throw new Error(`unresolved select for ${spec.name}.${want.label}`);
      }
      const existing = byLabel.get(want.label);
      if (!existing) {
        nextProps.push(payload);
        changed = true;
        continue;
      }
      const idx = nextProps.findIndex(p => p.label === want.label);
      if (
        (want.type === 'select' && nextProps[idx].content !== payload.content) ||
        (want.type === 'relationship' &&
          (nextProps[idx].content !== payload.content ||
            nextProps[idx].relationType !== payload.relationType))
      ) {
        nextProps[idx] = { ...nextProps[idx], ...payload, type: existing.type };
        changed = true;
      }
    }
    if (changed) {
      await api('POST', '/api/templates', {
        _id: tpl._id,
        name: tpl.name,
        color: tpl.color,
        default: tpl.default,
        commonProperties: tpl.commonProperties,
        properties: nextProps,
      });
      console.log('updated template', spec.name);
    }
  }

  console.log('poll schema ready');
});
