// Migration dry-run on a COPY of the user's real notes.
// Source (read-only): <Documents>\PenNotebook  (override with PENS_REAL_DATA_DIR)
// Target: a temp folder. The real folder is only read, never written.
// Skips automatically if no real data exists (e.g. CI).
const { installElectronStub } = require('../helpers/electron-stub');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

function realDocs() {
  if (process.env.PENS_REAL_DATA_DIR) return process.env.PENS_REAL_DATA_DIR;
  try {
    return path.join(execFileSync('powershell', ['-NoProfile', '-Command', "[Environment]::GetFolderPath('MyDocuments')"]).toString().trim(), 'PenNotebook');
  } catch { return path.join(os.homedir(), 'Documents', 'PenNotebook'); }
}
const REAL = realDocs();
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const exists = fs.existsSync(path.join(REAL, 'Profiles', 'default', 'notes'));

test('M01 migration of a copy of real notes preserves every stroke and backs up every file', { skip: !exists && `no real data at ${REAL}` }, () => {
  const stub = installElectronStub();
  const dst = path.join(stub.__documentsDir, 'PenNotebook');
  fs.cpSync(REAL, dst, { recursive: true });

  const srcNotes = path.join(dst, 'Profiles', 'default', 'notes');
  const originals = fs.readdirSync(srcNotes).filter((f) => f.endsWith('.json'));
  const before = originals.map((f) => {
    const j = JSON.parse(fs.readFileSync(path.join(srcNotes, f), 'utf8'));
    return { f, hash: sha(path.join(srcNotes, f)), strokes: Array.isArray(j.strokes) ? j.strokes.length : 0, source: j.source };
  });
  const totalBefore = before.reduce((a, b) => a + b.strokes, 0);

  const store = require('../../main/store');
  const list = store.listNotes('default');

  const totalAfter = list.reduce((a, n) => a + (n.strokeCount || 0), 0);
  const backupDir = fs.readdirSync(path.join(dst, 'Profiles', 'default')).find((d) => d.startsWith('notes_backup_'));
  const report = {
    originalFiles: before.map((b) => ({ file: b.f.slice(0, 24) + '…', type: b.source?.type, strokes: b.strokes })),
    resultingNotes: list.map((n) => ({ type: n.type, title: n.title.slice(0, 70), strokeCount: n.strokeCount, source: String(n.source).slice(0, 70) })),
    totalStrokesBefore: totalBefore,
    totalStrokesAfter: totalAfter,
    backupDir,
  };
  fs.mkdirSync(path.join(__dirname, '..', 'results'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, '..', 'results', 'M01-real-migration.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  assert.ok(backupDir, 'no backup folder created');
  for (const b of before) {
    const bf = path.join(dst, 'Profiles', 'default', backupDir, b.f);
    assert.ok(fs.existsSync(bf), `missing backup of ${b.f}`);
    assert.equal(sha(bf), b.hash, `backup of ${b.f} differs from original`);
  }
  assert.equal(totalAfter, totalBefore, 'stroke count changed during migration');
  // every resulting note must be loadable
  for (const n of list) assert.ok(store.loadNotes('default', n.id), `cannot load migrated note ${n.id}`);
  // Stage 2 rule: one note per PDF file
  const pdfFiles = new Set(before.filter((b) => b.source?.type === 'pdf').map((b) => String(b.source.id).replace(/_page_\d+$/, '')));
  const pdfNotes = list.filter((n) => n.type === 'pdf');
  assert.equal(pdfNotes.length, pdfFiles.size, `${pdfFiles.size} PDF file(s) became ${pdfNotes.length} notes`);
});

