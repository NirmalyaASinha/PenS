const path = require('path');
const profileManager = require('./profileManager');
const utils = require('./utils');

const STATES = Object.freeze({
  UNLOCKED: 'Unlocked',
  LOCKED: 'Locked'
});

class LockManager {
  constructor() {
    this.filePath = path.join(profileManager.baseDir, 'lock-state.json');
    this.states = {};
    this.load();
  }

  load() {
    try {
      const data = utils.safeLoadJsonSync(this.filePath);
      if (data && data.schemaVersion === 1 && data.profiles && typeof data.profiles === 'object') {
        this.states = data.profiles;
      }
    } catch (error) {
      console.error('Unable to load lock state:', error.message);
      this.states = {};
    }
  }

  save() {
    utils.atomicWriteFileSync(this.filePath, JSON.stringify({
      schemaVersion: 1,
      profiles: this.states
    }, null, 2));
  }

  getState(profileId) {
    const state = this.states[profileId];
    if (!state || !Object.values(STATES).includes(state.status)) {
      return { status: STATES.UNLOCKED, failedAttempts: 0, lockedAt: null };
    }
    return { ...state };
  }

  setState(profileId, status) {
    if (!Object.values(STATES).includes(status)) throw new Error('Invalid lock state');
    const current = this.getState(profileId);
    this.states[profileId] = {
      ...current,
      status,
      lockedAt: status === STATES.LOCKED ? Date.now() : current.lockedAt
    };
    this.save();
    return this.getState(profileId);
  }

  isLocked(profileId) {
    return this.getState(profileId).status === STATES.LOCKED;
  }

  lock(profileId) {
    return this.setState(profileId, STATES.LOCKED);
  }

  unlock(profileId) {
    return this.setState(profileId, STATES.UNLOCKED);
  }

  status(profileId) {
    return this.getState(profileId);
  }
}

module.exports = { lockManager: new LockManager(), LOCK_STATES: STATES };
