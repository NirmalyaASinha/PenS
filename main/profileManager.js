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
      'default': {
        id: 'default',
        name: 'Default',
        displayName: 'Default',
        fullName: '',
        identityConfigured: false,
        color: '#1a73e8',
        avatar: '👤',
        created: Date.now()
      }
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
    return Object.keys(this.profiles).map((id) => this.getProfile(id));
  }

  getProfile(id) {
    if (id === 'guest') {
      return { id: 'guest', name: 'Guest', color: '#5f6368', avatar: '🕵️', created: 0 };
    }
    const profile = this.profiles[id] || this.profiles['default'];
    return {
      ...profile,
      displayName: profile.displayName || profile.name || 'Default',
      fullName: profile.fullName || '',
      identityConfigured: profile.identityConfigured === true,
      personalDetails: profile.personalDetails || {
        name: '',
        email: '',
        phone: '',
        address: '',
        origins: []
      }
    };
  }

  createProfile(name, color = '#1a73e8', avatar = '👤') {
    const id = 'profile_' + Date.now();
    this.profiles[id] = {
      id,
      name,
      displayName: name,
      fullName: '',
      identityConfigured: false,
      color,
      avatar,
      created: Date.now()
    };
    fs.mkdirSync(path.join(this.profilesDir, id, 'notes'), { recursive: true });
    this.save();
    return this.profiles[id];
  }

  updateProfile(id, fields) {
    if (id === 'guest' || !this.profiles[id]) throw new Error('Profile cannot be updated');
    const current = this.profiles[id];
    const updated = {
      ...current,
      displayName: fields.displayName,
      fullName: fields.fullName,
      identityConfigured: true,
      color: fields.color,
      avatar: fields.avatar
    };
    this.profiles[id] = updated;
    this.save();
    return this.getProfile(id);
  }

  updatePersonalDetails(id, details) {
    if (id === 'guest' || !this.profiles[id]) throw new Error('Profile cannot be updated');
    this.profiles[id].personalDetails = {
      ...details,
      origins: Array.isArray(details.origins) ? details.origins : []
    };
    this.save();
    return this.getProfile(id).personalDetails;
  }

  deleteProfile(id) {
    if (id === 'default' || id === 'guest' || !this.profiles[id]) {
      throw new Error('This profile cannot be deleted');
    }
    const profilePath = path.join(this.profilesDir, id);
    fs.rmSync(profilePath, { recursive: true, force: false });
    delete this.profiles[id];
    if (this.lastUsed === id) this.lastUsed = 'default';
    this.save();
    return true;
  }

  getNotesPath(profileId) {
    if (profileId === 'guest') {
      const gPath = path.join(this.profilesDir, 'guest', 'notes');
      if (!fs.existsSync(gPath)) fs.mkdirSync(gPath, { recursive: true });
      return gPath;
    }
    const p = this.profiles[profileId] ? profileId : 'default';
    const pPath = path.join(this.profilesDir, p, 'notes');
    if (!fs.existsSync(pPath)) fs.mkdirSync(pPath, { recursive: true });
    return pPath;
  }
}

module.exports = new ProfileManager();
