const fs = require('fs');

let content = fs.readFileSync('main/main.js', 'utf8');

// The replacement logic
content = content.replace(/ipcMain\.handle\('dialog:openPdf',\s*async\s*\(e\)\s*=>\s*\{/, 
`secureHandle('dialog:openPdf', null, async (e, profileId) => {`);

content = content.replace(/ipcMain\.handle\('store:save',\s*\(e,\s*id,\s*data\)\s*=>\s*store\.saveNotes\(getProfileIdFromEvent\(e\),\s*id,\s*data\)\);/, 
`secureHandle('store:save', z.tuple([z.string().max(255), z.any()]), async (e, profileId, id, data) => store.saveNotes(profileId, id, data));`);

content = content.replace(/ipcMain\.handle\('store:load',\s*\(e,\s*id\)\s*=>\s*store\.loadNotes\(getProfileIdFromEvent\(e\),\s*id\)\);/, 
`secureHandle('store:load', z.tuple([z.string().max(255)]), async (e, profileId, id) => store.loadNotes(profileId, id));`);

content = content.replace(/ipcMain\.handle\('store:list',\s*\(e\)\s*=>\s*store\.listNotes\(getProfileIdFromEvent\(e\)\)\);/, 
`secureHandle('store:list', null, async (e, profileId) => store.listNotes(profileId));`);

content = content.replace(/ipcMain\.handle\('get-username',\s*\(\)\s*=>\s*require\('os'\)\.userInfo\(\)\.username\);/, 
`secureHandle('get-username', null, async () => require('os').userInfo().username);`);

content = content.replace(/ipcMain\.handle\('profiles:get-all',\s*\(\)\s*=>\s*profileManager\.getProfiles\(\)\);/, 
`secureHandle('profiles:get-all', null, async () => profileManager.getProfiles());`);

content = content.replace(/ipcMain\.handle\('profiles:create',\s*\(e,\s*name,\s*color,\s*avatar\)\s*=>\s*profileManager\.createProfile\(name,\s*color,\s*avatar\)\);/, 
`secureHandle('profiles:create', z.tuple([z.string().max(50), z.string().max(30), z.string().max(10)]), async (e, profileId, name, color, avatar) => profileManager.createProfile(name, color, avatar));`);

content = content.replace(/ipcMain\.handle\('profiles:open',\s*\(e,\s*profileId\)\s*=>\s*createWindow\(profileId\)\);/, 
`secureHandle('profiles:open', z.tuple([z.string().max(32)]), async (e, currentProfile, targetProfileId) => createWindow(targetProfileId));`);

content = content.replace(/ipcMain\.handle\('get-preload-path',\s*\(\)\s*=>\s*path\.join\(__dirname,\s*'\.\.',\s*'renderer',\s*'web-view-preload\.js'\)\);/, 
`secureHandle('get-preload-path', null, async () => path.join(__dirname, '..', 'renderer', 'web-view-preload.js'));`);

content = content.replace(/ipcMain\.handle\('bookmarks:get',\s*\(e\)\s*=>\s*bookmarksManager\.load\(getProfileIdFromEvent\(e\)\)\.bookmarks\);/, 
`secureHandle('bookmarks:get', null, async (e, profileId) => bookmarksManager.load(profileId).bookmarks);`);

content = content.replace(/ipcMain\.handle\('bookmarks:add',\s*\(e,\s*url,\s*title\)\s*=>\s*bookmarksManager\.addBookmark\(getProfileIdFromEvent\(e\),\s*url,\s*title\)\);/, 
`secureHandle('bookmarks:add', z.tuple([z.string().url().max(2000), z.string().max(200)]), async (e, profileId, url, title) => bookmarksManager.addBookmark(profileId, url, title));`);

content = content.replace(/ipcMain\.handle\('bookmarks:remove',\s*\(e,\s*id\)\s*=>\s*bookmarksManager\.removeBookmark\(getProfileIdFromEvent\(e\),\s*id\)\);/, 
`secureHandle('bookmarks:remove', z.tuple([z.string().max(50)]), async (e, profileId, id) => bookmarksManager.removeBookmark(profileId, id));`);

content = content.replace(/ipcMain\.handle\('history:add',\s*\(e,\s*url,\s*title\)\s*=>\s*historyManager\.addVisit\(getProfileIdFromEvent\(e\),\s*url,\s*title\)\);/, 
`secureHandle('history:add', z.tuple([z.string().url().max(2000), z.string().max(200).optional().default('')]), async (e, profileId, url, title) => historyManager.addVisit(profileId, url, title));`);

content = content.replace(/ipcMain\.handle\('history:get',\s*\(e\)\s*=>\s*historyManager\.getHistory\(getProfileIdFromEvent\(e\)\)\);/, 
`secureHandle('history:get', null, async (e, profileId) => historyManager.getHistory(profileId));`);

content = content.replace(/ipcMain\.handle\('history:clear',\s*\(e\)\s*=>\s*historyManager\.clearHistory\(getProfileIdFromEvent\(e\)\)\);/, 
`secureHandle('history:clear', null, async (e, profileId) => historyManager.clearHistory(profileId));`);

content = content.replace(/ipcMain\.handle\('settings:get',\s*\(e\)\s*=>\s*settingsManager\.load\(getProfileIdFromEvent\(e\)\)\);/, 
`secureHandle('settings:get', null, async (e, profileId) => settingsManager.load(profileId));`);

content = content.replace(/ipcMain\.handle\('settings:save',\s*\(e,\s*settings\)\s*=>\s*settingsManager\.save\(getProfileIdFromEvent\(e\),\s*settings\)\);/, 
`secureHandle('settings:save', z.tuple([z.any()]), async (e, profileId, settings) => settingsManager.save(profileId, settings));`);

content = content.replace(/ipcMain\.handle\('downloads:get',\s*\(e\)\s*=>\s*downloadsManager\.load\(getProfileIdFromEvent\(e\)\)\);/, 
`secureHandle('downloads:get', null, async (e, profileId) => downloadsManager.load(profileId));`);

content = content.replace(/ipcMain\.handle\('privacy:clear-data',\s*async\s*\(e\)\s*=>\s*\{[\s\S]*?return true;\s*\}\);/, 
`secureHandle('privacy:clear-data', null, async (e, profileId) => {
    const partition = profileId === 'guest' ? 'guest' : \`persist:\${profileId}\`;
    const profileSession = session.fromPartition(partition);
    await profileSession.clearStorageData();
    return true;
  });`);

content = content.replace(/ipcMain\.handle\('passwords:get',\s*\(e\)\s*=>\s*passwordsManager\.load\(getProfileIdFromEvent\(e\)\)\);/, 
`secureHandle('passwords:get', null, async (e, profileId) => passwordsManager.load(profileId));`);

content = content.replace(/ipcMain\.handle\('passwords:add',\s*\(e,\s*url,\s*user,\s*pass\)\s*=>\s*passwordsManager\.addPassword\(getProfileIdFromEvent\(e\),\s*url,\s*user,\s*pass\)\);/, 
`secureHandle('passwords:add', z.tuple([z.string().url().max(2000), z.string().max(255), z.string().max(255)]), async (e, profileId, url, user, pass) => passwordsManager.addPassword(profileId, url, user, pass));`);

content = content.replace(/ipcMain\.handle\('sync:export',\s*async\s*\(e\)\s*=>\s*\{[\s\S]*?return false;\s*\}\);/, 
`secureHandle('sync:export', null, async (e, profileId) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Export Profile',
      defaultPath: 'profile.penprofile',
      filters: [{ name: 'PenS Profile', extensions: ['penprofile'] }]
    });
    if (!canceled && filePath) {
      await syncManager.exportProfile(profileId, filePath);
      return true;
    }
    return false;
  });`);

content = content.replace(/ipcMain\.handle\('webview:printToPdf',\s*async\s*\(e,\s*wcId\)\s*=>\s*\{/, 
`secureHandle('webview:printToPdf', z.tuple([z.number()]), async (e, profileId, wcId) => {`);

fs.writeFileSync('main/main.js', content, 'utf8');
console.log('IPC handlers replaced.');
