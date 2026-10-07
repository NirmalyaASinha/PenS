const fs = require('fs');
const path = require('path');
const profileManager = require('./profileManager');
const utils = require('./utils');

const defaultSettings = {
  theme: 'system',
  searchEngine: 'https://www.google.com/search?q=%s',
  startupBehavior: 'new-tab',
  defaultZoom: 1.0,
  performanceMode: false,
  homeBackgroundImage: '',
  shieldsEnabled: true,
  lockIdleMinutes: 0,
  lockOnMinimize: false,
  lockOnSystemLock: false,
  lockOnStartup: false
};

class SettingsManager {
  getFilePath(profileId) {
    const profilePath = path.join(profileManager.profilesDir, profileId);
    if (!fs.existsSync(profilePath)) fs.mkdirSync(profilePath, { recursive: true });
    return path.join(profilePath, 'settings.json');
  }

  load(profileId) {
    const file = this.getFilePath(profileId);
    try {
      const data = utils.safeLoadJsonSync(file);
      if (data) return { ...defaultSettings, ...data };
    } catch(e) { console.error(e); }
    return { ...defaultSettings };
  }

  save(profileId, settings) {
    const current = this.load(profileId);
    const updated = { ...current, ...settings };
    utils.atomicWriteFileSync(this.getFilePath(profileId), JSON.stringify(updated, null, 2));
    return updated;
  }
}

module.exports = new SettingsManager();
