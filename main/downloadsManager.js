const fs = require('fs');
const path = require('path');
const profileManager = require('./profileManager');
const { app } = require('electron');
const utils = require('./utils');

class DownloadsManager {
  constructor() {
    this.activeDownloads = new Map();
  }

  getFilePath(profileId) {
    const profilePath = path.join(profileManager.profilesDir, profileId);
    if (!fs.existsSync(profilePath)) fs.mkdirSync(profilePath, { recursive: true });
    return path.join(profilePath, 'downloads.json');
  }

  load(profileId) {
    const file = this.getFilePath(profileId);
    try {
      return utils.safeLoadJsonSync(file) || [];
    } catch(e) { console.error(e); }
    return [];
  }

  save(profileId, downloads) {
    utils.atomicWriteFileSync(this.getFilePath(profileId), JSON.stringify(downloads, null, 2));
  }

  recordDownload(profileId, itemInfo) {
    if (profileId === 'guest') return;
    const dls = this.load(profileId);
    dls.unshift(itemInfo); // Add to top
    this.save(profileId, dls);
  }

  attachSession(sessionObj, profileId) {
    sessionObj.on('will-download', async (event, item, webContents) => {
      // Task 4.4: Download safety
      // Sanitize name
      let filename = utils.sanitizeFilename(item.getFilename());
      
      const ext = path.extname(filename).toLowerCase();
      const riskyTypes = ['.exe', '.msi', '.bat', '.cmd', '.ps1', '.js', '.vbs', '.lnk', '.scr', '.jar'];
      
      if (riskyTypes.includes(ext)) {
        const { dialog, BrowserWindow } = require('electron');
        const win = BrowserWindow.fromWebContents(webContents);
        const { response } = await dialog.showMessageBox(win, {
          type: 'warning',
          buttons: ['Cancel', 'Download Anyway'],
          defaultId: 0,
          title: 'Dangerous File Type',
          message: `This file type (${ext}) can harm your computer. Are you sure you want to download ${filename}?`
        });
        if (response === 0) {
          event.preventDefault();
          item.cancel();
          return;
        }
      }

      const id = Date.now().toString();
      const savePath = item.getSavePath() || path.join(app.getPath('downloads'), filename);
      item.setSavePath(savePath);

      const itemInfo = {
        id,
        filename,
        url: item.getURL(),
        state: 'progressing',
        received: 0,
        total: item.getTotalBytes(),
        savePath,
        timestamp: Date.now()
      };
      
      this.activeDownloads.set(id, item);

      item.on('updated', (event, state) => {
        if (state === 'interrupted') {
          itemInfo.state = 'interrupted';
        } else if (state === 'progressing') {
          if (item.isPaused()) itemInfo.state = 'paused';
          else {
            itemInfo.state = 'progressing';
            itemInfo.received = item.getReceivedBytes();
          }
        }
        webContents.send('download-updated', itemInfo);
      });

      item.once('done', (event, state) => {
        itemInfo.state = state;
        itemInfo.received = item.getTotalBytes();
        
        // Task 4.4: Mark-of-the-Web
        if (state === 'completed' && process.platform === 'win32') {
           try {
             fs.writeFileSync(savePath + ':Zone.Identifier', '[ZoneTransfer]\r\nZoneId=3');
           } catch(e) {}
        }

        this.recordDownload(profileId, itemInfo);
        webContents.send('download-updated', itemInfo);
        this.activeDownloads.delete(id);
      });
    });
  }
}

module.exports = new DownloadsManager();
