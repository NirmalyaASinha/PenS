const crypto = require('crypto');
const { safeStorage } = require('electron');
const path = require('path');
const profileManager = require('./profileManager');
const utils = require('./utils');

const STATES = Object.freeze({
  UNLOCKED: 'Unlocked',
  LOCKED: 'Locked'
});
const SCRYPT = Object.freeze({ N: 32768, r: 8, p: 1, keyLength: 32 });
const MAX_LOCKOUT_MS = 5 * 60 * 1000;

class LockError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }

  verifyCredential(profileId, secret) {
    const record = this.getRecord(profileId);
    return Boolean(record.credential && this.matches(record, secret));
  }
}

class LockManager {
  constructor() {
    this.filePath = path.join(profileManager.baseDir, 'lock-state.json');
    this.states = {};
    this.integrityKey = null;
    this.integrityFailure = false;
    this.needsMigration = false;
  }

  initialize() {
    this.load();
    if (this.integrityFailure) {
      this.states = Object.fromEntries(Object.entries(this.states).map(([profileId, state]) => [
        profileId,
        { ...state, status: STATES.LOCKED, lockedAt: Date.now() }
      ]));
    }
    if (this.needsMigration || this.integrityFailure) this.save();
  }

  canonicalStates(states) {
    return JSON.stringify(states, Object.keys(states).sort());
  }

  getIntegrityKey(protectedKey) {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new LockError('LOCK_INTEGRITY', 'OS-protected lock storage is unavailable.');
    }
    if (protectedKey) {
      return Buffer.from(safeStorage.decryptString(Buffer.from(protectedKey, 'base64')), 'base64');
    }
    const key = crypto.randomBytes(32);
    return key;
  }

  load() {
    try {
      const data = utils.safeLoadJsonSync(this.filePath);
      if (!data || !data.profiles || typeof data.profiles !== 'object') return;
      this.states = data.profiles;
      if (data.schemaVersion === 3 && data.integrity?.protectedKey && data.integrity?.digest) {
        this.integrityKey = this.getIntegrityKey(data.integrity.protectedKey);
        const expected = crypto.createHmac('sha256', this.integrityKey)
          .update(this.canonicalStates(this.states))
          .digest('base64');
        const actual = Buffer.from(data.integrity.digest, 'base64');
        const expectedBuffer = Buffer.from(expected, 'base64');
        if (actual.length !== expectedBuffer.length || !crypto.timingSafeEqual(actual, expectedBuffer)) {
          this.integrityFailure = true;
        }
      } else if (data.schemaVersion === 1 || data.schemaVersion === 2) {
        this.needsMigration = true;
      } else {
        this.integrityFailure = true;
      }
    } catch (error) {
      console.error('Unable to load or verify lock state:', error.message);
      this.integrityFailure = true;
    }
  }

  save() {
    if (!this.integrityKey) {
      this.integrityKey = this.getIntegrityKey();
    }
    const protectedKey = safeStorage.encryptString(this.integrityKey.toString('base64')).toString('base64');
    const digest = crypto.createHmac('sha256', this.integrityKey)
      .update(this.canonicalStates(this.states))
      .digest('base64');
    utils.atomicWriteFileSync(this.filePath, JSON.stringify({
      schemaVersion: 3,
      profiles: this.states,
      integrity: { algorithm: 'hmac-sha256', protectedKey, digest }
    }, null, 2));
    this.integrityFailure = false;
    this.needsMigration = false;
  }

  getRecord(profileId) {
    const state = this.states[profileId];
    if (!state || !Object.values(STATES).includes(state.status)) {
      return { status: STATES.UNLOCKED, failedAttempts: 0, nextAttemptAt: null, lockedAt: null };
    }
    return { ...state };
  }

  getState(profileId) {
    const record = this.getRecord(profileId);
    return {
      status: record.status,
      failedAttempts: record.failedAttempts || 0,
      nextAttemptAt: record.nextAttemptAt || null,
      lockedAt: record.lockedAt || null,
      credentialConfigured: Boolean(record.credential),
      credentialType: record.credential?.type || null,
      recoveryConfigured: Boolean(record.recovery)
    };
  }

  createRecoveryKey() {
    return crypto.randomBytes(24).toString('base64url').match(/.{1,6}/g).join('-').toUpperCase();
  }

  recoveryDigest(key, salt) {
    return crypto.createHash('sha256').update(salt).update(String(key).trim().toUpperCase()).digest('base64');
  }

  setState(profileId, status) {
    if (this.integrityFailure) throw new LockError('LOCK_INTEGRITY', 'Lock state integrity verification failed.');
    if (!Object.values(STATES).includes(status)) throw new LockError('LOCK_CONFIG', 'Invalid lock state.');
    const current = this.getRecord(profileId);
    this.states[profileId] = {
      ...current,
      status,
      lockedAt: status === STATES.LOCKED ? Date.now() : current.lockedAt
    };
    this.save();
    return this.getState(profileId);
  }

  isLocked(profileId) {
    return this.getRecord(profileId).status === STATES.LOCKED;
  }

  lock(profileId) {
    const record = this.getRecord(profileId);
    if (record.credential && !record.recovery) {
      const recoveryKey = this.createRecoveryKey();
      const recoverySalt = crypto.randomBytes(16);
      this.states[profileId] = {
        ...record,
        status: STATES.LOCKED,
        lockedAt: Date.now(),
        recovery: {
          salt: recoverySalt.toString('base64'),
          digest: this.recoveryDigest(recoveryKey, recoverySalt)
        }
      };
      this.save();
      return { ...this.getState(profileId), recoveryKey };
    }
    return this.setState(profileId, STATES.LOCKED);
  }

  validateCredential(type, secret) {
    if (type !== 'pin' && type !== 'password') throw new LockError('LOCK_CONFIG', 'Credential type must be pin or password.');
    if (typeof secret !== 'string') throw new LockError('LOCK_CONFIG', 'Credential is required.');
    if (type === 'pin' && !/^\d{6,}$/.test(secret)) {
      throw new LockError('LOCK_CONFIG', 'PIN must contain at least 6 digits.');
    }
    if (type === 'password' && secret.length < 8) {
      throw new LockError('LOCK_CONFIG', 'Password must contain at least 8 characters.');
    }
  }

  derive(secret, salt) {
    return crypto.scryptSync(secret, salt, SCRYPT.keyLength, {
      N: SCRYPT.N,
      r: SCRYPT.r,
      p: SCRYPT.p,
      maxmem: 64 * 1024 * 1024
    });
  }

  matches(record, secret) {
    if (!record.credential || typeof secret !== 'string') return false;
    const expected = Buffer.from(record.credential.verifier, 'base64');
    const actual = this.derive(secret, Buffer.from(record.credential.salt, 'base64'));
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  }

  setCredential(profileId, type, secret, currentSecret = null) {
    this.validateCredential(type, secret);
    const record = this.getRecord(profileId);
    if (record.status === STATES.LOCKED) throw new LockError('LOCK_CONFIG', 'Unlock the profile before changing its credential.');
    if (record.credential && !this.matches(record, currentSecret)) {
      throw new LockError('LOCK_AUTH', 'Current credential is incorrect.');
    }
    const salt = crypto.randomBytes(16);
    const verifier = this.derive(secret, salt);
    const recoveryKey = this.createRecoveryKey();
    const recoverySalt = crypto.randomBytes(16);
    this.states[profileId] = {
      ...record,
      credential: {
        type,
        salt: salt.toString('base64'),
        verifier: verifier.toString('base64'),
        params: SCRYPT
      },
      recovery: {
        salt: recoverySalt.toString('base64'),
        digest: this.recoveryDigest(recoveryKey, recoverySalt)
      }
    };
    this.save();
    return { ...this.getState(profileId), recoveryKey };
  }

  removeCredential(profileId, currentSecret) {
    const record = this.getRecord(profileId);
    if (!record.credential || !this.matches(record, currentSecret)) {
      throw new LockError('LOCK_AUTH', 'Current credential is incorrect.');
    }
    delete record.credential;
    delete record.recovery;
    this.states[profileId] = { ...record, status: STATES.UNLOCKED, failedAttempts: 0, nextAttemptAt: null };
    this.save();
    return this.getState(profileId);
  }

  unlock(profileId, secret) {
    const record = this.getRecord(profileId);
    if (!record.credential) throw new LockError('LOCK_CONFIG', 'No lock credential is configured.');
    const now = Date.now();
    const normalizedSecret = typeof secret === 'string' ? secret.trim() : '';
    const recoveryMatches = record.recovery
      && recoveryDigestMatches(normalizedSecret, record.recovery);
    if (!recoveryMatches && record.nextAttemptAt && now < record.nextAttemptAt) {
      const seconds = Math.ceil((record.nextAttemptAt - now) / 1000);
      throw new LockError('LOCK_DELAY', `Try again in ${seconds} seconds.`);
    }
    if (!this.matches(record, normalizedSecret) && !recoveryMatches) {
      const failedAttempts = (record.failedAttempts || 0) + 1;
      const delay = failedAttempts >= 5 ? Math.min(30000 * (2 ** (failedAttempts - 5)), MAX_LOCKOUT_MS) : 0;
      this.states[profileId] = {
        ...record,
        status: STATES.LOCKED,
        failedAttempts,
        nextAttemptAt: delay ? now + delay : null
      };
      this.save();
      throw new LockError('LOCK_AUTH', 'Credential is incorrect.');
    }
    const unlockedRecord = { ...record, status: STATES.UNLOCKED, failedAttempts: 0, nextAttemptAt: null };
    if (recoveryMatches) delete unlockedRecord.recovery;
    this.states[profileId] = unlockedRecord;
    this.save();
    return this.getState(profileId);
  }
}

function recoveryDigestMatches(key, recovery) {
  if (!recovery || typeof recovery.salt !== 'string' || typeof recovery.digest !== 'string') return false;
  const expected = Buffer.from(recovery.digest, 'base64');
  const actual = crypto.createHash('sha256')
    .update(Buffer.from(recovery.salt, 'base64'))
    .update(String(key).trim().toUpperCase())
    .digest();
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

module.exports = { lockManager: new LockManager(), LOCK_STATES: STATES };
