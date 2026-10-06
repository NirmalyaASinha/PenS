// Unit tests for main/passwordsManager.js (vault encryption, master password, auto-lock,
// clipboard clearing, autofill origin matching). Temp data folder via electron stub.
const { installElectronStub } = require('../helpers/electron-stub');
const stub = installElectronStub({ safeStorageAvailable: true });

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const crypto = require('crypto');
const pm = require('../../main/passwordsManager');

let n = 0;
const pid = () => `qa_pw_${Date.now()}_${n++}`;
const SECRET = 'Hunter2-SuperSecret!';
// The vault's 30-minute auto-lock timers would keep this process alive; release them at the end.
test.after(() => { for (const p of [...pm.lockTimers.keys()]) pm.lock(p); });

test('P01 vault file on disk contains no plaintext username or password', () => {
  const p = pid();
  pm.load(p); // initialises vault
  pm.addPassword(p, 'https://bank.example', 'alice@example.com', SECRET);
  const raw = fs.readFileSync(pm.getFilePath(p), 'utf8');
  assert.ok(!raw.includes(SECRET) && !raw.includes('alice@example.com') && !raw.includes('bank.example'));
  pm.lock(p);
});

test('P02 with a master password set, a locked vault cannot be opened without it', () => {
  const p = pid();
  pm.unlock(p, 'correct horse battery staple'); // creates vault with master password
  pm.addPassword(p, 'https://bank.example', 'alice', SECRET);
  pm.lock(p);
  const result = pm.load(p); // no master password supplied
  assert.equal(result, null, `vault opened without master password, returned ${JSON.stringify(result)}`);
});

test('P03 wrong master password is rejected (non-empty vault)', () => {
  const p = pid();
  pm.unlock(p, 'right-password');
  pm.addPassword(p, 'https://a.example', 'u', SECRET);
  pm.lock(p);
  assert.equal(pm.unlock(p, 'wrong-password'), null);
});

test('P04 wrong master password on an EMPTY vault must not be accepted (else later entries become unreadable)', () => {
  const p = pid();
  pm.unlock(p, 'right-password');
  pm.lock(p);
  const r = pm.unlock(p, 'typo-password');
  let lostEntry = false;
  if (r !== null) {
    pm.addPassword(p, 'https://a.example', 'u', SECRET);
    pm.lock(p);
    const withRight = pm.unlock(p, 'right-password');
    lostEntry = !withRight || withRight.length === 0;
  }
  assert.equal(r, null, `wrong password accepted; entry saved afterwards unreadable with the right password: ${lostEntry}`);
});

test('P05 without OS encryption (safeStorage unavailable) the vault key must not be stored in plaintext next to the data', () => {
  // Simulate a machine where DPAPI is unavailable.
  const orig = stub.safeStorage.isEncryptionAvailable;
  stub.safeStorage.isEncryptionAvailable = () => false;
  try {
    const p = pid();
    pm.load(p);
    pm.addPassword(p, 'https://x.example', 'u', SECRET);
    const vault = JSON.parse(fs.readFileSync(pm.getFilePath(p), 'utf8'));
    let recovered = null;
    try {
      const key = Buffer.from(vault.wrappedKey, 'hex');
      const e = vault.passwords[0];
      const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(e.iv, 'hex'));
      d.setAuthTag(Buffer.from(e.authTag, 'hex'));
      recovered = JSON.parse(d.update(e.data, 'hex', 'utf8') + d.final('utf8')).password;
    } catch { /* not recoverable = good */ }
    assert.notEqual(recovered, SECRET, 'password decrypted using only the vault file');
  } finally {
    stub.safeStorage.isEncryptionAvailable = orig;
  }
});

test('P06 load() (what IPC passwords:get returns to the renderer) does not include plaintext passwords', () => {
  const p = pid();
  pm.load(p);
  pm.addPassword(p, 'https://y.example', 'bob', SECRET);
  const list = pm.load(p);
  assert.ok(!JSON.stringify(list).includes(SECRET), `load() returned: ${JSON.stringify(list)}`);
});

test('P07 auto-lock after 30 min inactivity actually requires re-auth', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const p = pid();
  pm.load(p);
  pm.addPassword(p, 'https://z.example', 'carol', SECRET);
  t.mock.timers.tick(30 * 60 * 1000 + 1);
  assert.equal(pm.unlockedKeys.has(p), false, 'key still in memory after 30 min');
  const after = pm.load(p);
  assert.equal(after, null, `after auto-lock load() returned ${JSON.stringify(after)} without re-auth`);
});

test('P08 clipboard cleared after 30 s only if it still holds the password', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  pm.copyToClipboard(SECRET);
  t.mock.timers.tick(30000);
  assert.equal(stub.clipboard.readText(), '');
  pm.copyToClipboard(SECRET);
  stub.clipboard.writeText('user copied something else');
  t.mock.timers.tick(30000);
  assert.equal(stub.clipboard.readText(), 'user copied something else');
});

test('P09 autofill matches exact origin only (look-alikes, scheme, port, subdomain rejected)', () => {
  const p = pid();
  pm.load(p);
  pm.addPassword(p, 'https://bank.example', 'alice', SECRET);
  assert.equal(pm.getForAutofill(p, 'https://bank.example/login').length, 1);
  for (const evil of ['https://bank.example.evil.io/', 'http://bank.example/', 'https://bank.example:8443/', 'https://login.bank.example/', 'https://bank-example.com/', 'https://xn--bnk-sla.example/']) {
    assert.equal(pm.getForAutofill(p, evil).length, 0, `autofilled into ${evil}`);
  }
});
