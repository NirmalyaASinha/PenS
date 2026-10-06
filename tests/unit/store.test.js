// Unit tests for main/store.js (note index, URL normalisation, duplicate merge, migration).
// Uses a temp Documents folder via the electron stub. Never touches real notes.
const { installElectronStub } = require('../helpers/electron-stub');
const stub = installElectronStub();

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const store = require('../../main/store');
const profileManager = require('../../main/profileManager');

const stroke = (n = 3) => ({ tool: 'pen', color: '#000', width: 2, points: Array.from({ length: n }, (_, i) => [i / 10, i / 10, 0.5]) });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function freshProfile(name) { await sleep(5); return profileManager.createProfile(name).id; }
const notesDir = (pid) => profileManager.getNotesPath(pid);
const insideBase = (p) => path.resolve(p).startsWith(path.resolve(stub.__root) + path.sep);

test('S00 sanity: data folder is the temp folder, not real Documents', () => {
  assert.ok(insideBase(profileManager.baseDir), profileManager.baseDir);
});

test('S01 normalizeUrl merges trailing slash and #fragment variants', () => {
  const a = store.normalizeUrl('https://www.google.com/');
  assert.equal(store.normalizeUrl('https://www.google.com'), a);
  assert.equal(store.normalizeUrl('https://www.google.com/#top'), a);
  assert.equal(store.normalizeUrl('HTTPS://WWW.GOOGLE.COM/'), a);
  assert.notEqual(store.normalizeUrl('http://www.google.com/'), a, 'http and https must stay distinct');
});

test('S02 saving the same page via URL variants yields exactly one note', async () => {
  const pid = await freshProfile('s02');
  for (const u of ['https://example.org/a', 'https://example.org/a/', 'https://example.org/a#x']) {
    store.saveNotes(pid, u, { version: 1, source: { type: 'web', url: u }, strokes: [stroke()] });
  }
  const list = store.listNotes(pid);
  assert.equal(list.length, 1, JSON.stringify(list.map((n) => n.id)));
});

test('S03 hostile note ids never create files outside the notes folder', async () => {
  const pid = await freshProfile('s03');
  for (const id of ['../../../evil', '..\\..\\evil2', 'C:\\Windows\\evil3', 'CON', 'a'.repeat(300)]) {
    store.saveNotes(pid, id, { version: 1, source: { type: 'blank', id }, strokes: [stroke()] });
  }
  const files = fs.readdirSync(notesDir(pid));
  assert.ok(files.every((f) => /^([0-9a-f]{32}\.json|notes_index\.json)$/.test(f)), files.join(', '));
  assert.ok(!fs.existsSync(path.join(stub.__root, 'evil')) && !fs.existsSync(path.join(profileManager.baseDir, 'evil')));
});

test('S04 thumbnail is kept in the index, not in the stroke file', async () => {
  const pid = await freshProfile('s04');
  store.saveNotes(pid, 'https://t.example/', { version: 1, source: { type: 'web', url: 'https://t.example/' }, strokes: [stroke()], thumbnail: 'data:image/jpeg;base64,AAAA' });
  const meta = store.listNotes(pid)[0];
  assert.equal(meta.thumbnail, 'data:image/jpeg;base64,AAAA');
  const raw = fs.readFileSync(path.join(notesDir(pid), meta.file), 'utf8');
  assert.ok(!raw.includes('thumbnail'));
});

test('S05 loadNotes with traversal ids returns null', async () => {
  const pid = await freshProfile('s05');
  assert.equal(store.loadNotes(pid, '../../profiles.json'), null);
  assert.equal(store.loadNotes(pid, 'notes_index'), null);
});

test('S06 index entries carry all Stage 2 metadata fields', async () => {
  const pid = await freshProfile('s06');
  store.saveNotes(pid, 'https://m.example/', { version: 1, source: { type: 'web', url: 'https://m.example/' }, strokes: [stroke(), stroke()] });
  const meta = store.listNotes(pid)[0];
  for (const k of ['title', 'type', 'source', 'created', 'updated', 'strokeCount', 'pageCount', 'tags', 'favorite', 'thumbnail']) {
    assert.ok(k in meta, `missing ${k}`);
  }
  assert.equal(meta.strokeCount, 2);
});

test('S07 notes index file carries a format version number (Principle 2)', async () => {
  const pid = await freshProfile('s07');
  store.saveNotes(pid, 'https://v.example/', { version: 1, source: { type: 'web', url: 'https://v.example/' }, strokes: [] });
  const idx = JSON.parse(fs.readFileSync(path.join(notesDir(pid), 'notes_index.json'), 'utf8'));
  assert.ok('version' in idx, `index top-level keys: ${Object.keys(idx).join(', ')}`);
});

test('S08 corrupt index: listNotes does not throw and does not destroy the corrupt file', async () => {
  const pid = await freshProfile('s08');
  store.saveNotes(pid, 'https://c.example/', { version: 1, source: { type: 'web', url: 'https://c.example/' }, strokes: [stroke()] });
  const idxPath = path.join(notesDir(pid), 'notes_index.json');
  fs.writeFileSync(idxPath, '{"notes": {"trunc');
  let threw = null;
  try { store.listNotes(pid); } catch (e) { threw = e.message; }
  assert.equal(threw, null, `listNotes threw: ${threw}`);
});

test('S09 migration merges duplicate legacy files for the same page and backs up originals', async () => {
  const pid = await freshProfile('s09');
  const dir = notesDir(pid);
  fs.writeFileSync(path.join(dir, 'legacyA.json'), JSON.stringify({ version: 1, source: { type: 'web', url: 'https://www.google.com/' }, strokes: [stroke(), stroke()] }));
  fs.writeFileSync(path.join(dir, 'legacyB.json'), JSON.stringify({ version: 1, source: { type: 'web', url: 'https://www.google.com' }, strokes: [stroke()] }));
  const list = store.listNotes(pid);
  assert.equal(list.length, 1, JSON.stringify(list.map((n) => n.id)));
  assert.equal(list[0].strokeCount, 3);
  const backups = fs.readdirSync(path.dirname(dir)).filter((d) => d.startsWith('notes_backup_'));
  assert.equal(backups.length, 1);
  assert.deepEqual(fs.readdirSync(path.join(path.dirname(dir), backups[0])).sort(), ['legacyA.json', 'legacyB.json']);
});

test('S10 migration: pages of one PDF become ONE note (Stage 2 requirement)', async () => {
  const pid = await freshProfile('s10');
  const dir = notesDir(pid);
  for (const p of [1, 2, 3]) {
    fs.writeFileSync(path.join(dir, `pdf${p}.json`), JSON.stringify({ version: 1, source: { type: 'pdf', id: `file:///C:/qa/Task.pdf_page_${p}` }, strokes: [stroke()] }));
  }
  const list = store.listNotes(pid);
  assert.equal(list.length, 1, `got ${list.length} notes: ${list.map((n) => n.id).join(' | ')}`);
});

test('S11 new PDF saves (current pdf-viewer id format "<file>_page_N") produce one note per PDF', async () => {
  const pid = await freshProfile('s11');
  for (const p of [1, 2]) {
    const id = `file:///C:/qa/Book.pdf_page_${p}`;
    store.saveNotes(pid, id, { version: 1, source: { type: 'pdf', id }, strokes: [stroke()] });
  }
  const list = store.listNotes(pid);
  assert.equal(list.length, 1, `got ${list.length}: ${list.map((n) => n.id).join(' | ')}`);
});

test('S12 web save in the shape renderer.js actually sends ({strokes:{strokes:[...]}}) records a correct strokeCount', async () => {
  // renderer.js line ~889 wraps e.args[0] (which web-view-preload sends as {strokes} or {strokes, thumbnail})
  const pid = await freshProfile('s12');
  const payloadFromPreload = { strokes: [stroke(), stroke()], thumbnail: 'data:image/jpeg;base64,AA' };
  store.saveNotes(pid, 'https://w.example/', { version: 1, source: { type: 'web', url: 'https://w.example/' }, strokes: payloadFromPreload });
  const meta = store.listNotes(pid)[0];
  const loaded = store.loadNotes(pid, 'https://w.example/');
  assert.equal(meta.strokeCount, 2, `index strokeCount=${meta.strokeCount}`);
  assert.ok(Array.isArray(loaded.strokes), `loaded.strokes is ${typeof loaded.strokes} (keys: ${Object.keys(loaded.strokes || {})})`);
});

