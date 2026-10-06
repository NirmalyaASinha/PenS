// TEST-ONLY. Replaces require('electron') with a stub so main-process modules
// (store, passwordsManager, profileManager) can be unit tested in plain Node.
// All data goes to a fresh temp folder. The real Documents folder is never touched.
const Module = require('module');
const fs = require('fs');
const os = require('os');
const path = require('path');

function installElectronStub({ safeStorageAvailable = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pens-unit-'));
  const documentsDir = path.join(root, 'Documents');
  fs.mkdirSync(documentsDir, { recursive: true });

  const clipboardState = { text: '' };
  const stub = {
    __root: root,
    __documentsDir: documentsDir,
    app: {
      getPath: (name) => (name === 'documents' ? documentsDir : path.join(root, name)),
      isPackaged: false,
    },
    // Fake safeStorage: reversible "encryption" marked with a prefix so tests can
    // tell wrapped from unwrapped keys. Real Windows uses DPAPI.
    safeStorage: {
      isEncryptionAvailable: () => safeStorageAvailable,
      encryptString: (s) => Buffer.from('ENC:' + Buffer.from(s, 'utf8').toString('base64')),
      decryptString: (b) => {
        const t = Buffer.from(b).toString();
        if (!t.startsWith('ENC:')) throw new Error('not encrypted');
        return Buffer.from(t.slice(4), 'base64').toString('utf8');
      },
    },
    clipboard: {
      writeText: (t) => { clipboardState.text = t; },
      readText: () => clipboardState.text,
      clear: () => { clipboardState.text = ''; },
    },
  };

  const origLoad = Module._load;
  Module._load = function (request, ...rest) {
    if (request === 'electron') return stub;
    return origLoad.call(this, request, ...rest);
  };
  return stub;
}

module.exports = { installElectronStub };

