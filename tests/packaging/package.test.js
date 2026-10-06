// Packaging checks on the BUILT app in dist/win-unpacked (does not launch it).
// Run `npm run dist` first. Set PENS_DIST_DIR to test another build folder.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const DIST = process.env.PENS_DIST_DIR || path.join(ROOT, 'dist', 'win-unpacked');
const EXE = path.join(DIST, 'pens.exe');
const ASAR = path.join(DIST, 'resources', 'app.asar');
const haveBuild = fs.existsSync(EXE) && fs.existsSync(ASAR);
const skip = !haveBuild && `no packaged build at ${DIST}`;

let asar;
try { asar = require('@electron/asar'); } catch { /* optional */ }
const list = () => asar.listPackage(ASAR).map((p) => p.replace(/\\/g, '/'));

test('K01 package contains no source maps, tests, scratch, CI or helper scripts', { skip: skip || (!asar && '@electron/asar missing') }, () => {
  const files = list().filter((f) => !f.startsWith('/node_modules/'));
  const bad = files.filter((f) => /\.map$|^\/tests?\/|^\/scratch\/|^\/\.github\/|security-test\.html|^\/fix-.*\.js$|^\/refactor-ipc\.js$|^\/replace\.js$|^\/test(-afterPack)?\.js$|^\/scratch-path\.js$|^\/playwright\.config\.js$|\.md$/i.test(f));
  assert.deepEqual(bad, [], `dev files in package: ${bad.join(', ')}`);
});

test('K02 package node_modules contains no devDependencies (electron, electron-builder, playwright)', { skip: skip || (!asar && '@electron/asar missing') }, () => {
  const tops = new Set(list().filter((f) => f.startsWith('/node_modules/')).map((f) => f.split('/').slice(2, f.split('/')[2]?.startsWith('@') ? 4 : 3).join('/')));
  const dev = ['electron', 'electron-builder', '@playwright/test', 'playwright', '@electron/fuses', 'app-builder-lib'].filter((d) => tops.has(d));
  assert.deepEqual(dev, [], `dev deps packaged: ${dev}`);
});

test('K03 packaged main.js matches the repo main.js (build is not stale)', { skip: skip || (!asar && '@electron/asar missing') }, () => {
  const packed = asar.extractFile(ASAR, 'main\\main.js').toString();
  const repo = fs.readFileSync(path.join(ROOT, 'main', 'main.js'), 'utf8');
  assert.equal(packed.replace(/\r/g, ''), repo.replace(/\r/g, ''), 'dist is older than / differs from main/main.js – rebuild before release testing');
});

test('K04 packaged main.js has no unconditional DevTools opening or debug logging', { skip: skip || (!asar && '@electron/asar missing') }, () => {
  const packed = asar.extractFile(ASAR, 'main\\main.js').toString();
  const hits = packed.split(/\r?\n/).map((l, i) => [i + 1, l.trim()]).filter(([, l]) => /openDevTools\(|\[PROTOCOL\]|\[RENDERER\]|\[MAIN\]/.test(l));
  assert.deepEqual(hits, [], JSON.stringify(hits));
});

test('K05 Electron Fuses are set as required', { skip }, async () => {
  const { getCurrentFuseWire, FuseV1Options, FuseState } = require('@electron/fuses');
  const wire = await getCurrentFuseWire(EXE);
  const want = {
    RunAsNode: false, EnableCookieEncryption: true, EnableNodeOptionsEnvironmentVariable: false,
    EnableNodeCliInspectArguments: false, EnableEmbeddedAsarIntegrityValidation: true, OnlyLoadAppFromAsar: true,
    GrantFileProtocolExtraPrivileges: false,
  };
  const actual = {};
  for (const k of Object.keys(want)) actual[k] = wire[FuseV1Options[k]] === FuseState.ENABLE;
  console.log('fuses:', JSON.stringify(actual));
  assert.deepEqual(actual, want);
});

test('K06 pens.exe carries a valid Authenticode signature', { skip }, () => {
  const out = execFileSync('powershell', ['-NoProfile', '-Command', `(Get-AuthenticodeSignature '${EXE}').Status`]).toString().trim();
  console.log('signature status:', out);
  assert.equal(out, 'Valid');
});

test('K07 asar.unpacked contents are listed for justification', { skip }, () => {
  const dir = path.join(DIST, 'resources', 'app.asar.unpacked');
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.relative(dir, path.join(d, e.name))]));
  const files = fs.existsSync(dir) ? walk(dir) : [];
  console.log(`unpacked (${files.length}):`, files.slice(0, 20).join(', '));
  assert.ok(files.every((f) => /\.node$|\.dll$/i.test(f)), `non-native files unpacked: ${files.filter((f) => !/\.node$|\.dll$/i.test(f)).slice(0, 10)}`);
});

test('K08 installer config: per-user install, user data kept on uninstall', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.build.nsis.perMachine, false);
  assert.equal(pkg.build.nsis.deleteAppDataOnUninstall, false);
  assert.notEqual(pkg.build.win.publisherName, 'Your Name Here', 'publisherName is still the placeholder (breaks updater signature check)');
});

