const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openPdf: () => ipcRenderer.invoke('dialog:openPdf'),
  readPdf: (filePath) => ipcRenderer.invoke('pdf:read', filePath),
  exportPdf: (sourcePath, annotations, strokes) => ipcRenderer.invoke('pdf:export', sourcePath, annotations, strokes),
  saveNotes: (id, data) => ipcRenderer.invoke('store:save', id, data),
  loadNotes: (id) => ipcRenderer.invoke('store:load', id),
  listNotes: () => ipcRenderer.invoke('store:list'),
  getUsername: () => ipcRenderer.invoke('get-username'),
  getPreloadPath: () => ipcRenderer.invoke('get-preload-path'),
  printToPdf: (wcId) => ipcRenderer.invoke('webview:printToPdf', wcId),
  
  // Profile APIs
  getProfiles: () => ipcRenderer.invoke('profiles:get-all'),
  getCurrentProfile: () => ipcRenderer.invoke('profiles:get-current'),
  createProfile: (name, color, avatar) => ipcRenderer.invoke('profiles:create', name, color, avatar),
  updateProfile: (profile) => ipcRenderer.invoke('profiles:update', profile),
  getPersonalDetails: (origin) => ipcRenderer.invoke('profiles:personal-details:get', origin),
  updatePersonalDetails: (details) => ipcRenderer.invoke('profiles:personal-details:update', details),
  openProfile: (id) => ipcRenderer.invoke('profiles:open', id),
  onProfileInfo: (callback) => ipcRenderer.on('profile-info', (e, profile) => callback(profile)),

  // Bookmarks & History
  getBookmarks: () => ipcRenderer.invoke('bookmarks:get'),
  addBookmark: (url, title) => ipcRenderer.invoke('bookmarks:add', url, title),
  removeBookmark: (id) => ipcRenderer.invoke('bookmarks:remove', id),
  addHistory: (url, title) => ipcRenderer.invoke('history:add', url, title),
  getHistory: () => ipcRenderer.invoke('history:get'),
  clearHistory: () => ipcRenderer.invoke('history:clear'),

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  getLockState: () => ipcRenderer.invoke('lock:state'),
  lockProfile: () => ipcRenderer.invoke('lock:lock'),
  unlockProfile: (secret) => ipcRenderer.invoke('lock:unlock', secret),
  setLockCredential: (type, secret, currentSecret = null) => ipcRenderer.invoke('lock:credential:set', type, secret, currentSecret),
  removeLockCredential: (currentSecret) => ipcRenderer.invoke('lock:credential:remove', currentSecret),
  fetchHomeFeed: (topic, kind) => ipcRenderer.invoke('home:fetch-feed', topic, kind),
  onSettingsLoaded: (callback) => ipcRenderer.on('settings-loaded', (e, settings) => callback(settings)),

  // Downloads & Privacy
  getDownloads: () => ipcRenderer.invoke('downloads:get'),
  onDownloadUpdated: (callback) => ipcRenderer.on('download-updated', (e, info) => callback(info)),
  clearBrowsingData: () => ipcRenderer.invoke('privacy:clear-data'),

  // Passwords
  getPasswords: () => ipcRenderer.invoke('passwords:get'),
  addPassword: (url, user, pass) => ipcRenderer.invoke('passwords:add', url, user, pass),

  // Sync
  exportProfile: () => ipcRenderer.invoke('sync:export'),

  // Tab reload listener from main process
  onReloadActiveTab: (callback) => ipcRenderer.on('tab:reload-active', (e, opts) => callback(opts))
});
