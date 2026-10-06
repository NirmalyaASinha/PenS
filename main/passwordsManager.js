const fs = require('fs');
const path = require('path');
const { safeStorage, clipboard } = require('electron');
const crypto = require('crypto');
const profileManager = require('./profileManager');
const utils = require('./utils');
const { URL } = require('url');

// Task 3.1: Password vault with master password
class PasswordsManager {
  constructor() {
    this.unlockedKeys = new Map(); // profileId -> vaultKey (Buffer)
    this.lockTimers = new Map();   // profileId -> timeout
  }

  getFilePath(profileId) {
    const profilePath = path.join(profileManager.profilesDir, profileId);
    if (!fs.existsSync(profilePath)) fs.mkdirSync(profilePath, { recursive: true });
    return path.join(profilePath, 'passwords.json');
  }

  // Derive key from optional master password using scrypt
  _deriveKey(masterPassword, salt) {
    return crypto.scryptSync(masterPassword || '', salt, 32, { N: 16384, r: 8, p: 1 });
  }

  // Initialize a new vault
  _initVault(profileId, masterPassword) {
    const salt = crypto.randomBytes(16);
    const key = this._deriveKey(masterPassword, salt);
    
    // safeStorage wrap is optional but good for local persistence if no master password
    let wrappedKey = key.toString('hex');
    if (safeStorage.isEncryptionAvailable()) {
      wrappedKey = safeStorage.encryptString(key.toString('hex'));
    }

    const vault = {
      version: 1,
      salt: salt.toString('hex'),
      wrappedKey: wrappedKey.toString('hex'),
      passwords: [] 
    };
    
    this.unlockedKeys.set(profileId, key);
    this._resetLockTimer(profileId);
    utils.atomicWriteFileSync(this.getFilePath(profileId), JSON.stringify(vault, null, 2));
    return [];
  }

  unlock(profileId, masterPassword) {
    const file = this.getFilePath(profileId);
    if (!fs.existsSync(file)) {
      return this._initVault(profileId, masterPassword);
    }

    try {
      const vault = JSON.parse(fs.readFileSync(file, 'utf8'));
      const salt = Buffer.from(vault.salt, 'hex');
      let key;
      
      if (masterPassword) {
         key = this._deriveKey(masterPassword, salt);
      } else if (vault.wrappedKey) {
         // Attempt to unwrap using safeStorage
         if (safeStorage.isEncryptionAvailable()) {
           try {
             const keyHex = safeStorage.decryptString(Buffer.from(vault.wrappedKey, 'hex'));
             key = Buffer.from(keyHex, 'hex');
           } catch(e) {
             console.error("Failed to decrypt wrappedKey with safeStorage", e);
             return null;
           }
         } else {
           // Fallback if it wasn't safeStorage encrypted (raw hex)
           key = Buffer.from(vault.wrappedKey, 'hex');
         }
      } else {
         return null; // Need master password
      }
      
      // Decrypt to test
      const passwordsList = [];
      for (const encEntry of vault.passwords) {
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(encEntry.iv, 'hex'));
        decipher.setAuthTag(Buffer.from(encEntry.authTag, 'hex'));
        let decrypted = decipher.update(encEntry.data, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        passwordsList.push(JSON.parse(decrypted));
      }

      this.unlockedKeys.set(profileId, key);
      this._resetLockTimer(profileId);
      return passwordsList;
    } catch(e) {
      console.error("Failed to unlock vault", e);
      return null;
    }
  }

  lock(profileId) {
    this.unlockedKeys.delete(profileId);
    if (this.lockTimers.has(profileId)) {
      clearTimeout(this.lockTimers.get(profileId));
      this.lockTimers.delete(profileId);
    }
  }

  _resetLockTimer(profileId) {
    if (this.lockTimers.has(profileId)) clearTimeout(this.lockTimers.get(profileId));
    // Auto-lock on inactivity (e.g., 30 minutes)
    this.lockTimers.set(profileId, setTimeout(() => this.lock(profileId), 30 * 60 * 1000));
  }

  load(profileId) {
    // Return unlocked passwords if available, otherwise null
    let key = this.unlockedKeys.get(profileId);
    if (!key) {
      // Try to auto-unlock without a master password
      if (!this.unlock(profileId, null)) {
         return null;
      }
      key = this.unlockedKeys.get(profileId);
    }
    this._resetLockTimer(profileId);

    const file = this.getFilePath(profileId);
    const vault = JSON.parse(fs.readFileSync(file, 'utf8'));
    const passwordsList = [];
    for (const encEntry of vault.passwords) {
      try {
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(encEntry.iv, 'hex'));
        decipher.setAuthTag(Buffer.from(encEntry.authTag, 'hex'));
        let decrypted = decipher.update(encEntry.data, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        passwordsList.push(JSON.parse(decrypted));
      } catch(e) {}
    }
    return passwordsList;
  }

  addPassword(profileId, url, username, password) {
    const key = this.unlockedKeys.get(profileId);
    if (!key) throw new Error("Vault is locked");
    this._resetLockTimer(profileId);

    const file = this.getFilePath(profileId);
    const vault = JSON.parse(fs.readFileSync(file, 'utf8'));
    
    // Encrypt new entry
    const entry = { id: Date.now().toString(), url, username, password };
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let enc = cipher.update(JSON.stringify(entry), 'utf8', 'hex');
    enc += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    
    vault.passwords.push({
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      data: enc
    });

    utils.atomicWriteFileSync(file, JSON.stringify(vault, null, 2));
  }

  copyToClipboard(password) {
    clipboard.writeText(password);
    // Clear clipboard after 30 seconds
    setTimeout(() => {
      if (clipboard.readText() === password) {
        clipboard.clear();
      }
    }, 30000);
  }

  // Task 3.2: Safe autofill matching
  getForAutofill(profileId, targetUrl) {
    const passwords = this.load(profileId);
    if (!passwords) return [];

    try {
      const target = new URL(targetUrl);
      const targetOrigin = target.origin; // scheme + host + port
      
      return passwords.filter(p => {
        try {
          const pOrigin = new URL(p.url).origin;
          return pOrigin === targetOrigin;
        } catch(e) { return false; }
      }).map(p => ({ username: p.username, password: p.password }));
    } catch(e) {
      return [];
    }
  }
}

module.exports = new PasswordsManager();
