const fs = require('fs');
const path = require('path');
const profileManager = require('./profileManager');
const utils = require('./utils');

class BookmarksManager {
  getFilePath(profileId) {
    const profilePath = path.join(profileManager.profilesDir, profileId);
    if (!fs.existsSync(profilePath)) fs.mkdirSync(profilePath, { recursive: true });
    return path.join(profilePath, 'bookmarks.json');
  }

  load(profileId) {
    const file = this.getFilePath(profileId);
    try {
      const data = utils.safeLoadJsonSync(file);
      if (data) return data;
    } catch(e) { console.error(e); }
    return { bookmarks: [] };
  }

  save(profileId, data) {
    utils.atomicWriteFileSync(this.getFilePath(profileId), JSON.stringify(data, null, 2));
  }

  addBookmark(profileId, url, title) {
    const data = this.load(profileId);
    if (!data.bookmarks.find(b => b.url === url)) {
      data.bookmarks.push({ id: Date.now().toString(), url, title, dateAdded: Date.now() });
      this.save(profileId, data);
    }
    return data.bookmarks;
  }

  removeBookmark(profileId, id) {
    const data = this.load(profileId);
    data.bookmarks = data.bookmarks.filter(b => b.id !== id);
    this.save(profileId, data);
    return data.bookmarks;
  }
}

module.exports = new BookmarksManager();

