const fs = require('fs');
const path = require('path');
const profileManager = require('./profileManager');

class HistoryManager {
  getFilePath(profileId) {
    const profilePath = path.join(profileManager.profilesDir, profileId);
    if (!fs.existsSync(profilePath)) fs.mkdirSync(profilePath, { recursive: true });
    return path.join(profilePath, 'history.jsonl'); // using jsonl for easy appending
  }

  addVisit(profileId, url, title) {
    if (profileId === 'guest') return; // Do not record for guest
    if (url === 'pens://home') return;
    
    const file = this.getFilePath(profileId);
    const entry = JSON.stringify({ url, title, timestamp: Date.now() }) + '\n';
    fs.appendFileSync(file, entry);
  }

  getHistory(profileId) {
    const file = this.getFilePath(profileId);
    if (!fs.existsSync(file)) return [];
    
    const lines = fs.readFileSync(file, 'utf8').split('\n').filter(l => l.trim() !== '');
    return lines.map(l => {
      try { return JSON.parse(l); } catch(e) { return null; }
    }).filter(Boolean).reverse(); // newest first
  }

  clearHistory(profileId) {
    const file = this.getFilePath(profileId);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
}

module.exports = new HistoryManager();

