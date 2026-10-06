const fs = require('fs');
const path = require('path');
const { app } = require('electron');

class ProfileManager {
  constructor() {
    this.baseDir = path.join(app.getPath('documents'), 'PenNotebook');
    this.profilesFile = path.join(this.baseDir, 'profiles.json');
    this.profilesDir = path.join(this.baseDir, 'Profiles');
    this.profiles = {};
    this.lastUsed = 'default';
    this.init();
  }

  init() {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }

    if (!fs.existsSync(this.profilesFile)) {
      this.migrateLegacyData();
    } else {
      const data = JSON.parse(fs.readFileSync(this.profilesFile, 'utf8'));
      this.profiles = data.profiles || {};
      this.lastUsed = data.lastUsed || 'default';
    }
  }

  migrateLegacyData() {
    this.profiles = {
      'default': { id: 'default', name: 'Default', color: '#1a73e8', avatar: '👤', created: Date.now() }
    };
    this.lastUsed = 'default';
    
    const defaultNotesDir = path.join(this.profilesDir, 'default', 'notes');
    fs.mkdirSync(defaultNotesDir, { recursive: true });

    // Safely migrate old notes without losing them (renames original to .bak)
    const oldFiles = fs.readdirSync(this.baseDir).filter(f => f.endsWith('.json') && f !== 'profiles.json');
    for (const file of oldFiles) {
      const oldPath = path.join(this.baseDir, file);
      const newPath = path.join(defaultNotesDir, file);
      fs.copyFileSync(oldPath, newPath);
      fs.renameSync(oldPath, oldPath + '.bak'); 
    }
    this.save();
  }

  save() {
    // Requires require('./utils') at the top. Let me just inline require for now to avoid messing up the class structure.
    const utils = require('./utils');
    utils.atomicWriteFileSync(this.profilesFile, JSON.stringify({
      profiles: this.profiles,
      lastUsed: this.lastUsed
    }, null, 2));
  }

  getProfiles() {
    return Object.values(this.profiles);
  }

  getProfile(id) {
    return this.profiles[id] || this.profiles['default'];
  }

  createProfile(name, color = '#1a73e8', avatar = '👤') {
    const id = 'profile_' + Date.now();
    this.profiles[id] = { id, name, color, avatar, created: Date.now() };
    fs.mkdirSync(path.join(this.profilesDir, id, 'notes'), { recursive: true });
    this.save();
    return this.profiles[id];
  }

  getNotesPath(profileId) {
    const p = this.profiles[profileId] ? profileId : 'default';
    const pPath = path.join(this.profilesDir, p, 'notes');
    if (!fs.existsSync(pPath)) fs.mkdirSync(pPath, { recursive: true });
    return pPath;
  }
}

module.exports = new ProfileManager();

