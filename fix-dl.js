const fs = require('fs');
let code = fs.readFileSync('main/downloadsManager.js', 'utf8');

const replacement = `
  attachSession(sessionObj, profileId) {
    sessionObj.on('will-download', async (event, item, webContents) => {
      // Task 4.4: Download safety
      // Sanitize name
      let filename = item.getFilename();
      filename = filename.replace(/[/\\\\?%*:|"<>]/g, '_'); // Basic sanitization
      
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
          message: \`This file type (\${ext}) can harm your computer. Are you sure you want to download \${filename}?\`
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
             fs.writeFileSync(savePath + ':Zone.Identifier', '[ZoneTransfer]\\r\\nZoneId=3');
           } catch(e) {}
        }

        this.recordDownload(profileId, itemInfo);
        webContents.send('download-updated', itemInfo);
        this.activeDownloads.delete(id);
      });
    });
  }
`;

code = code.replace(/attachSession\(sessionObj, profileId\) \{[\s\S]*?\}\s*\}/, replacement.trim());
fs.writeFileSync('main/downloadsManager.js', code, 'utf8');
