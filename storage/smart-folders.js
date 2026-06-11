/**
 * Smart folders — rule-driven, dynamic session grouping (Pro).
 *
 * Unlike basic folders (a manual `session.folderId` assignment), a smart
 * folder stores a set of RULES and computes its members on the fly. Nothing
 * is written onto sessions; membership is always derived from current data.
 *
 * Stored under chrome.storage key `smartFolders` = { [id]: SmartFolder }.
 *
 * SmartFolder { id, name, color?, createdAt, updatedAt, rules: RuleGroup }
 *
 * RuleGroup {
 *   match: 'all' | 'any',          // AND vs OR across conditions
 *   conditions: Condition[]
 * }
 *
 * Condition { field, op, value }
 *   string fields  : name | url | title | tag   ops: contains|equals|startsWith|endsWith
 *   number fields  : tabCount | createdAt        ops: eq|gt|gte|lt|lte
 *   boolean fields : isAuto                       ops: eq
 *
 * url/title/tag are multi-valued (across a session's tabs/tags): a condition
 * matches if ANY value satisfies it. String comparison is case-insensitive.
 */

import { getAllSessions, sanitizeColor } from './storage.js';

const KEY = 'smartFolders';

const STRING_FIELDS = ['name', 'url', 'title', 'tag'];
const NUMBER_FIELDS = ['tabCount', 'createdAt'];
const BOOL_FIELDS = ['isAuto'];

const STRING_OPS = ['contains', 'equals', 'startsWith', 'endsWith'];
const NUMBER_OPS = ['eq', 'gt', 'gte', 'lt', 'lte'];
const BOOL_OPS = ['eq'];

// ─── Rule evaluation (pure) ────────────────────────────────────────────────────

function stringCandidates(session, field) {
  switch (field) {
    case 'name': return [session.name ?? ''];
    case 'url': return (session.tabs ?? []).map(t => t.url ?? '');
    case 'title': return (session.tabs ?? []).map(t => t.title ?? '');
    case 'tag': return session.tags ?? [];
    default: return [];
  }
}

function stringOp(op, hay, needle) {
  switch (op) {
    case 'contains': return hay.includes(needle);
    case 'equals': return hay === needle;
    case 'startsWith': return hay.startsWith(needle);
    case 'endsWith': return hay.endsWith(needle);
    default: return false;
  }
}

function numberOp(op, a, b) {
  switch (op) {
    case 'eq': return a === b;
    case 'gt': return a > b;
    case 'gte': return a >= b;
    case 'lt': return a < b;
    case 'lte': return a <= b;
    default: return false;
  }
}

function matchCondition(session, { field, op, value }) {
  if (STRING_FIELDS.includes(field)) {
    const needle = String(value).toLowerCase();
    return stringCandidates(session, field).some(c =>
      stringOp(op, String(c).toLowerCase(), needle));
  }
  if (NUMBER_FIELDS.includes(field)) {
    const actual = field === 'tabCount' ? (session.tabs?.length ?? 0) : session.createdAt;
    return numberOp(op, actual, Number(value));
  }
  if (BOOL_FIELDS.includes(field)) {
    return Boolean(session.isAuto) === Boolean(value);
  }
  return false; // unknown field never matches
}

/**
 * Does a session satisfy a RuleGroup? Pure and side-effect-free, exported so
 * the UI can run live previews and tests can exercise it directly.
 */
export function matchSession(session, rules) {
  if (!rules || !Array.isArray(rules.conditions) || rules.conditions.length === 0) {
    return false;
  }
  const results = rules.conditions.map(c => matchCondition(session, c));
  return rules.match === 'any' ? results.some(Boolean) : results.every(Boolean);
}

// ─── Validation ────────────────────────────────────────────────────────────────

export function validateRules(rules) {
  if (!rules || typeof rules !== 'object') throw new Error('rules must be an object');
  if (rules.match !== 'all' && rules.match !== 'any') {
    throw new Error("rules.match must be 'all' or 'any'");
  }
  if (!Array.isArray(rules.conditions) || rules.conditions.length === 0) {
    throw new Error('rules.conditions must be a non-empty array');
  }
  for (const c of rules.conditions) {
    if (!c || typeof c !== 'object') throw new Error('each condition must be an object');
    const isString = STRING_FIELDS.includes(c.field);
    const isNumber = NUMBER_FIELDS.includes(c.field);
    const isBool = BOOL_FIELDS.includes(c.field);
    if (!isString && !isNumber && !isBool) throw new Error(`unknown field: ${c.field}`);
    const ops = isString ? STRING_OPS : isNumber ? NUMBER_OPS : BOOL_OPS;
    if (!ops.includes(c.op)) throw new Error(`invalid op '${c.op}' for field '${c.field}'`);
    if (c.value === undefined || c.value === null) throw new Error('condition.value is required');
  }
  return true;
}

// ─── CRUD ──────────────────────────────────────────────────────────────────────

function _id() {
  return `sf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function getSmartFolders() {
  const { [KEY]: smartFolders = {} } = await chrome.storage.local.get(KEY);
  return smartFolders;
}

export async function getSmartFolder(id) {
  const all = await getSmartFolders();
  return all[id] ?? null;
}

export async function createSmartFolder(name, rules, { color = null } = {}) {
  validateRules(rules);
  const all = await getSmartFolders();
  const now = Date.now();
  const folder = { id: _id(), name, color: sanitizeColor(color), createdAt: now, updatedAt: now, rules };
  all[folder.id] = folder;
  await chrome.storage.local.set({ [KEY]: all });
  return folder;
}

export async function updateSmartFolder(id, partial = {}) {
  const all = await getSmartFolders();
  if (!all[id]) throw new Error(`Smart folder ${id} not found`);
  if (partial.rules !== undefined) validateRules(partial.rules);
  const clean = { ...partial };
  if ('color' in clean) clean.color = sanitizeColor(clean.color);
  all[id] = { ...all[id], ...clean, id, updatedAt: Date.now() };
  await chrome.storage.local.set({ [KEY]: all });
  return all[id];
}

export async function deleteSmartFolder(id) {
  const all = await getSmartFolders();
  delete all[id];
  await chrome.storage.local.set({ [KEY]: all });
}

// ─── Evaluation against live sessions ────────────────────────────────────────────

/** Sessions matching a saved smart folder's rules, newest-first. */
export async function evaluateSmartFolder(id) {
  const folder = await getSmartFolder(id);
  if (!folder) throw new Error(`Smart folder ${id} not found`);
  return _evaluate(folder.rules);
}

/** Sessions matching an ad-hoc RuleGroup — for live UI previews before saving. */
export async function previewRules(rules) {
  validateRules(rules);
  return _evaluate(rules);
}

/** Member count for every smart folder: { [id]: number }. */
export async function getSmartFolderCounts() {
  const [folders, sessions] = await Promise.all([
    getSmartFolders(),
    getAllSessions(),
  ]);
  const list = Object.values(sessions);
  const out = {};
  for (const f of Object.values(folders)) {
    out[f.id] = list.filter(s => matchSession(s, f.rules)).length;
  }
  return out;
}

async function _evaluate(rules) {
  const sessions = Object.values(await getAllSessions());
  return sessions
    .filter(s => matchSession(s, rules))
    .sort((a, b) => b.createdAt - a.createdAt);
}
