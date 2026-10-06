// Unit tests for main/utils.js (filename sanitizer, atomic write, safe JSON load).
// Run: node --test tests/unit/utils.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const utils = require('../../main/utils');
const { sanitizeFilename, atomicWriteFileSync, safeLoadJsonSync } = utils;

const RESERVED = /^(CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³]|CONIN\$|CONOUT\$)(\..*)?$/i;
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'pens-utils-'));

test('U01 traversal strings cannot escape the target folder', () => {
  for (const evil of ['../../Windows/System32/evil.dll', '..\\..\\evil', '/etc/passwd', 'C:\\Windows\\x', '\\\\server\\share\\x']) {
    const out = sanitizeFilename(evil);
    assert.ok(!/[\\/]/.test(out), `separator survived: ${JSON.stringify(out)}`);
    const resolved = path.resolve(base, out);
    assert.equal(path.dirname(resolved), path.resolve(base), `escaped folder: ${evil} -> ${out}`);
  }
});

test('U02 classic Windows reserved names are neutralised', () => {
  for (const n of ['CON', 'con', 'PRN', 'AUX', 'NUL', 'COM1', 'LPT9', 'con.txt', 'NUL.tar.gz', 'CON ', 'CON.']) {
    const out = sanitizeFilename(n);
    assert.ok(!RESERVED.test(out), `${JSON.stringify(n)} -> ${JSON.stringify(out)} is still reserved`);
  }
});

test('U03 lesser-known reserved names (CONIN$, CONOUT$, COM¹) are neutralised', () => {
  for (const n of ['CONIN$', 'CONOUT$', 'COM¹', 'LPT².txt']) {
    const out = sanitizeFilename(n);
    assert.ok(!RESERVED.test(out), `${JSON.stringify(n)} -> ${JSON.stringify(out)} is still reserved`);
  }
});

test('U04 illegal and control characters are removed', () => {
  const out = sanitizeFilename('a:b*c?d"e<f>g|h\x01i\x1fj\x7fk\0l');
  assert.ok(!/[:*?"<>|\x00-\x1f\x7f]/.test(out), JSON.stringify(out));
});

test('U05 empty / dot-only / whitespace names get a fallback', () => {
  for (const n of ['', '.', '..', '...', '   ', ' . . ']) {
    assert.equal(sanitizeFilename(n), 'unnamed', `input ${JSON.stringify(n)}`);
  }
});

test('U06 very long names are truncated to <= 255 chars (NTFS component limit)', () => {
  const out = sanitizeFilename('a'.repeat(1000) + '.pdf');
  assert.ok(out.length <= 255, `length is ${out.length}`);
});

test('U07 non-string input returns fallback', () => {
  for (const v of [null, undefined, 42, {}, []]) assert.equal(sanitizeFilename(v), 'unnamed');
});

test('U08 a shared "path is inside folder" helper exists (TASK 3.3 requirement)', () => {
  const candidates = Object.keys(utils).filter((k) => /inside|contain|within|safejoin|resolveinside/i.test(k));
  assert.ok(candidates.length > 0, `utils exports only: ${Object.keys(utils).join(', ')}`);
});

test('U09 atomicWriteFileSync writes content and leaves no temp files', () => {
  const dir = fs.mkdtempSync(path.join(base, 'aw-'));
  const f = path.join(dir, 'note.json');
  atomicWriteFileSync(f, '{"a":1}');
  atomicWriteFileSync(f, '{"a":2}');
  assert.equal(fs.readFileSync(f, 'utf8'), '{"a":2}');
  assert.deepEqual(fs.readdirSync(dir), ['note.json']);
});

test('U10 atomicWriteFileSync failure keeps the old file and cleans temp', () => {
  const dir = fs.mkdtempSync(path.join(base, 'awf-'));
  const target = path.join(dir, 'isdir');
  fs.mkdirSync(target); // renaming a file over a directory fails
  assert.throws(() => atomicWriteFileSync(target, 'x'));
  assert.deepEqual(fs.readdirSync(dir), ['isdir']);
});

test('U11 safeLoadJsonSync: missing -> null, oversize -> throws, malformed -> throws', () => {
  assert.equal(safeLoadJsonSync(path.join(base, 'nope.json')), null);
  const big = path.join(base, 'big.json');
  fs.writeFileSync(big, JSON.stringify({ s: 'x'.repeat(2048) }));
  assert.throws(() => safeLoadJsonSync(big, 1024), /exceeds max size/);
  const bad = path.join(base, 'bad.json');
  fs.writeFileSync(bad, '{not json');
  assert.throws(() => safeLoadJsonSync(bad));
});

