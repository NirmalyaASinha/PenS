const { app, BrowserWindow, Menu, ipcMain, dialog, session, protocol, net, shell, powerMonitor } = require('electron');
const path = require('path');

// Disable default application menu to prevent Ctrl+R/F5 from reloading the entire app window
Menu.setApplicationMenu(null);

// Task 1.4: Secure pens:// protocol - Register as privileged
protocol.registerSchemesAsPrivileged([
  { scheme: 'pens', privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: false } }
]);

// Task 1.3: Safe shell.openExternal
async function safeOpenExternal(urlStr) {
  try {
    const parsedUrl = new URL(urlStr);
    const allowedSchemes = ['http:', 'https:', 'mailto:'];
    if (!allowedSchemes.includes(parsedUrl.protocol)) return false;
    
    const { response } = await dialog.showMessageBox({
      type: 'question',
      buttons: ['Yes', 'No'],
      title: 'Confirm Navigation',
      message: `Do you want to open the external application for ${parsedUrl.protocol}?`,
      detail: urlStr
    });
    if (response === 0) {
      await shell.openExternal(urlStr);
      return true;
    }

    function clearProfileReauth(profileId) {
      const prefix = `${profileId}:`;
      for (const key of reauthSessions.keys()) {
        if (key.startsWith(prefix)) reauthSessions.delete(key);
      }
    }
    return false;
  } catch (err) {
    return false;
  }
}
// Replace direct usages globally if they exist, or provide the helper for future use.

const store = require('./store');
const profileManager = require('./profileManager');
const bookmarksManager = require('./bookmarksManager');
const historyManager = require('./historyManager');
const settingsManager = require('./settingsManager');
const downloadsManager = require('./downloadsManager');
const { lockManager } = require('./lockManager');

const windowProfiles = new Map();
const lockWindows = new Map();
const reauthSessions = new Map();
const REAUTH_REQUIRED = new Set(['passwords:get', 'sync:export', 'profiles:delete']);
const profileActivity = new Map();
const idleTimers = new Map();
const lockingProfiles = new Set();

// Task 4.1: Certificate errors
const trustedCerts = new Map();
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  const host = new URL(url).hostname;
  if (trustedCerts.get(host) && Date.now() - trustedCerts.get(host) < 3600000) {
    event.preventDefault();
    callback(true);
    return;
  }
  event.preventDefault();
  webContents.send('cert-error', { url, error });
  callback(false);
});

// Task 2.2: Verify sender and validate input
// Task 2.3: Enforce per-profile authorization
const { z } = require('zod');

function getProfileIdFromEvent(event) {
  // Reject web content and subframes
  if (!event.senderFrame) throw new Error('No sender frame');
  
  // Verify sender URL against the expected trusted page
  const senderUrl = event.senderFrame.url;
  if (!senderUrl.startsWith('pens://app/')) {
    throw new Error('Unauthorized sender');
  }

  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) throw new Error('No window for sender');

  const profileId = windowProfiles.get(win.id) || 'default';
  
  // Validate profile ID format
  if (!/^[a-z0-9_-]{1,32}$/.test(profileId)) {
    throw new Error('Invalid profile ID format');
  }
  
  return profileId;
}

secureHandle('trust-cert', null, async (e, profileId, host) => trustedCerts.set(host, Date.now()));
// IPC Wrapper to catch validation errors
const rateLimits = new Map();
function secureHandle(channel, schema, handler) {
  ipcMain.handle(channel, async (e, ...args) => {
    try {
      const profileId = getProfileIdFromEvent(e);
      if (!channel.startsWith('lock:') && lockManager.isLocked(profileId)) {
        throw new Error('Profile is locked');
      }
      if (REAUTH_REQUIRED.has(channel) && !hasRecentReauth(profileId, e.sender.id)) {
        const error = new Error('Reauthentication required.');
        error.code = 'LOCK_REAUTH';
        throw error;
      }
      if (['privacy:clear-data', 'sync:export', 'passwords:get'].includes(channel)) {
        const key = `${profileId}:${channel}`;
        const lastCall = rateLimits.get(key) || 0;
        if (Date.now() - lastCall < 2000) throw new Error('Rate limit exceeded');
        rateLimits.set(key, Date.now());
      }

      function reauthKey(profileId, senderId) {
        return `${profileId}:${senderId}`;
      }

      function hasRecentReauth(profileId, senderId) {
        const expiresAt = reauthSessions.get(reauthKey(profileId, senderId)) || 0;
        if (expiresAt <= Date.now()) {
          reauthSessions.delete(reauthKey(profileId, senderId));
          return false;
        }
        return true;
      }

      function requireRecentReauth(profileId, senderId) {
        if (!hasRecentReauth(profileId, senderId)) {
          const error = new Error('Reauthentication required.');
          error.code = 'LOCK_REAUTH';
          throw error;
        }
      }
      let validatedArgs = [];
      if (schema) validatedArgs = schema.parse(args);
      return await handler(e, profileId, ...validatedArgs);
    } catch (err) {
      if (err.message === 'Profile is locked' || err.code?.startsWith('LOCK_')) throw new Error(err.message);
      console.error(`IPC Validation Error on ${channel}:`, err.message);
      return { error: 'Validation failed' };
    }
  });
}

function getProfileWindows(profileId) {
  const lockWindow = lockWindows.get(profileId);
  return BrowserWindow.getAllWindows().filter((win) => (
    windowProfiles.get(win.id) === profileId && lockWindow !== win
  ));
}

function showProfileWindows(profileId) {
  getProfileWindows(profileId).forEach((win) => {
    if (!win.isDestroyed()) {
      win.setContentProtection(false);
      win.show();
      win.focus();
      win.setTitle('कलम');
      win.webContents.send('profile-unlocked');
    }
  });
}

function createLockWindow(profileId) {
  const existing = lockWindows.get(profileId);
  if (existing && !existing.isDestroyed()) {
    existing.show();
    existing.focus();
    return existing;
  }
  const profile = profileManager.getProfile(profileId);
  const partition = profileId === 'guest' ? 'guest' : `persist:${profileId}`;
  const lockWindow = new BrowserWindow({
    width: 460,
    height: 560,
    minWidth: 380,
    minHeight: 460,
    resizable: false,
    title: 'कलम',
    icon: path.join(__dirname, '..', 'LOGO.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      session: session.fromPartition(partition)
    }
  });
  lockWindow.setContentProtection(true);
  lockWindow.setTitle('कलम');
  lockWindows.set(profileId, lockWindow);
  windowProfiles.set(lockWindow.id, profileId);
  lockWindow.loadURL('pens://app/renderer/lock.html');
  lockWindow.webContents.on('did-finish-load', () => {
    lockWindow.webContents.send('profile-info', profile);
  });
  lockWindow.on('closed', () => {
    windowProfiles.delete(lockWindow.id);
    if (lockWindows.get(profileId) === lockWindow) lockWindows.delete(profileId);
  });
  return lockWindow;
}

function lockProfileWindows(profileId) {
  const windows = BrowserWindow.getAllWindows().filter((win) => (
    windowProfiles.get(win.id) === profileId && lockWindows.get(profileId) !== win
  ));
  windows.forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send('profile-locked');
      win.setContentProtection(true);
      win.hide();
      win.setTitle('कलम');
    }
  });
  createLockWindow(profileId);
}

function isProfileActive(profileId) {
  const activity = profileActivity.get(profileId);
  return activity && Math.max(activity.activeUntil || 0, activity.lastActivity || 0) > Date.now();
}

function lockProfileAutomatically(profileId, reason) {
  if (lockingProfiles.has(profileId) || lockManager.isLocked(profileId) || isProfileActive(profileId)) return false;
  if (!lockManager.getState(profileId).credentialConfigured) return false;
  return lockProfileAndHide(profileId, reason);
}

function lockProfileAndHide(profileId, reason) {
  if (lockingProfiles.has(profileId) || lockManager.isLocked(profileId)) return false;
  lockingProfiles.add(profileId);
  try {
    const locked = lockManager.lock(profileId);
    clearProfileReauth(profileId);
    lockProfileWindows(profileId);
    console.info(`Profile locked (${reason})`);
    return locked;
  } finally {
    lockingProfiles.delete(profileId);
  }
}

function scheduleIdleLock(profileId) {
  const previous = idleTimers.get(profileId);
  if (previous) clearTimeout(previous);
  const settings = settingsManager.load(profileId);
  const minutes = Number(settings.lockIdleMinutes) || 0;
  if (minutes <= 0) return;
  const delay = Math.max(1000, minutes * 60 * 1000);
  const timer = setTimeout(() => {
    if (isProfileActive(profileId)) {
      scheduleIdleLock(profileId);
      return;
    }
    lockProfileAutomatically(profileId, 'idle timeout');
    scheduleIdleLock(profileId);
  }, delay);
  idleTimers.set(profileId, timer);
}

secureHandle('activity:touch', z.tuple([z.object({
  active: z.boolean().optional(),
  durationMs: z.number().int().min(0).max(10000).optional()
}).optional()]), async (e, profileId, activity = {}) => {
  const now = Date.now();
  profileActivity.set(profileId, {
    lastActivity: now,
    activeUntil: activity.active ? now + (activity.durationMs || 1500) : now
  });
  scheduleIdleLock(profileId);
  return true;
});

secureHandle('lock:state', null, async (e, profileId) => lockManager.getState(profileId));
secureHandle('lock:lock', null, async (e, profileId) => {
  const state = lockManager.getState(profileId);
  if (!state.credentialConfigured) throw new Error('Set a PIN or password before locking this profile.');
  return lockProfileAndHide(profileId, 'manual request');
});
secureHandle('lock:unlock', z.tuple([z.string().min(1).max(512)]), async (e, profileId, secret) => {
  const unlocked = lockManager.unlock(profileId, secret);
  clearProfileReauth(profileId);
  const lockWindow = lockWindows.get(profileId);
  if (lockWindow && !lockWindow.isDestroyed()) lockWindow.close();
  showProfileWindows(profileId);
  return unlocked;
});
secureHandle('lock:reauth', z.tuple([z.string().min(1).max(512)]), async (e, profileId, secret) => {
  if (lockManager.isLocked(profileId) || !lockManager.verifyCredential(profileId, secret)) {
    const error = new Error('Credential is incorrect.');
    error.code = 'LOCK_AUTH';
    throw error;
  }
  reauthSessions.set(reauthKey(profileId, e.sender.id), Date.now() + 2 * 60 * 1000);
  return { expiresAt: Date.now() + 2 * 60 * 1000 };
});
secureHandle('lock:credential:set', z.tuple([
  z.enum(['pin', 'password']),
  z.string().min(1).max(512),
  z.string().min(1).max(512).nullable().optional()
]), async (e, profileId, type, secret, currentSecret) => {
  if (lockManager.getState(profileId).credentialConfigured) requireRecentReauth(profileId, e.sender.id);
  const result = lockManager.setCredential(profileId, type, secret, currentSecret || null);
  clearProfileReauth(profileId);
  return result;
});
secureHandle('lock:credential:remove', z.tuple([z.string().min(1).max(512)]), async (e, profileId, currentSecret) => {
  requireRecentReauth(profileId, e.sender.id);
  const result = lockManager.removeCredential(profileId, currentSecret);
  clearProfileReauth(profileId);
  return result;
});

function handlePensRequest(request) {
  const url = new URL(request.url);
  if (url.hostname !== 'app') return new Response('Forbidden', { status: 403 });
  
  // Serve only from allowlisted folder (this project directory)
  const normalizedPath = path.normalize(url.pathname);
  if (normalizedPath.includes('..') || normalizedPath.startsWith('\\\\')) {
    return new Response('Forbidden', { status: 403 });
  }
  
  const targetPath = path.join(__dirname, '..', normalizedPath);
  if (!targetPath.startsWith(path.join(__dirname, '..'))) {
    return new Response('Forbidden', { status: 403 });
  }
  
  return net.fetch(require('url').pathToFileURL(targetPath).toString());
}

function setupPensProtocol(targetSession) {
  if (targetSession && targetSession.protocol && !targetSession.protocol.isProtocolHandled('pens')) {
    targetSession.protocol.handle('pens', handlePensRequest);
  }

  if (targetSession && targetSession.webRequest) {
    targetSession.webRequest.onHeadersReceived((details, callback) => {
      if (details.url.startsWith('pens://')) {
        callback({
          responseHeaders: {
            ...details.responseHeaders,
            'Content-Security-Policy': ["default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' blob:; worker-src 'self' blob:; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; object-src 'none'"]
          }
        });
      } else {
        callback({ responseHeaders: details.responseHeaders });
      }
    });
  }
}

function createWindow(profileId = 'default') {
  const profile = profileManager.getProfile(profileId);
  if (profileId !== 'guest') {
    profileManager.lastUsed = profileId;
    profileManager.save();
  }
  const settings = settingsManager.load(profileId);

  const partition = profileId === 'guest' ? 'guest' : `persist:${profileId}`;
  const profileSession = session.fromPartition(partition);
  setupPensProtocol(profileSession);

  // Stage 4: Privacy & Permissions
  const sitePermissions = new Map(); // Store as `${profileId}:${origin}:${permission}`

  // Task 4.3: Permissions: default deny
  profileSession.setPermissionRequestHandler(async (webContents, permission, callback, details) => {
    if (lockManager.isLocked(profileId) || permission === 'notifications') {
      callback(false);
      return;
    }
    // Deny if not from a trusted top-level frame unless explicitly delegated (simplification: deny cross-origin)
    const requestingUrl = details.requestingUrl || webContents.getURL();
    let requestingOrigin;
    try {
      requestingOrigin = new URL(requestingUrl).origin;
    } catch(e) {
      return callback(false); // Invalid URL
    }
    
    // Deny sub-frame requests (if requestingUrl != top level URL)
    let topOrigin;
    try {
       topOrigin = new URL(webContents.getURL()).origin;
    } catch(e) {
       return callback(false);
    }
    if (requestingOrigin !== topOrigin) {
      // Cross-origin iframe requesting permission => deny
      return callback(false);
    }

    const key = `${profileId}:${requestingOrigin}:${permission}`;
    if (sitePermissions.has(key)) {
      return callback(sitePermissions.get(key));
    }

    // Prompt user
    const { BrowserWindow, dialog } = require('electron');
    const win = BrowserWindow.fromWebContents(webContents);
    if (!win) return callback(false);
    
    const { response } = await dialog.showMessageBox(win, {
      type: 'question',
      buttons: ['Deny', 'Allow'],
      defaultId: 0,
      title: 'Permission Request',
      message: `The site ${requestingOrigin} is requesting permission for: ${permission}`
    });

    const granted = response === 1;
    sitePermissions.set(key, granted);
    callback(granted);
  });

  profileSession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    if (lockManager.isLocked(profileId) || permission === 'notifications') return false;
    const key = `${profileId}:${requestingOrigin}:${permission}`;
    return sitePermissions.get(key) === true;
  });

  // Stage 2: Downloads
  downloadsManager.attachSession(profileSession, profileId);

  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: profile.color,
      symbolColor: '#ffffff'
    },
    icon: path.join(__dirname, '..', 'LOGO.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      session: profileSession
    }
  });
  mainWindow.setContentProtection(false);
  mainWindow.setTitle('कलम');

  // Intercept Ctrl+R, F5, Ctrl+Shift+R on the main window so the shell never reloads
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown') {
      const key = input.key.toLowerCase();
      if (input.control && input.shift && key === 'l') {
        event.preventDefault();
        const currentProfileId = windowProfiles.get(mainWindow.id);
        if (currentProfileId) {
          try {
            const state = lockManager.getState(currentProfileId);
            if (state.credentialConfigured && !lockManager.isLocked(currentProfileId)) {
              lockProfileAndHide(currentProfileId, 'keyboard shortcut');
            }
          } catch (error) {
            console.error('Unable to lock profile:', error.message);
          }
        }
        return;
      }
      if ((input.control && key === 'r') || key === 'f5') {
        event.preventDefault();
        mainWindow.webContents.send('tab:reload-active', { ignoreCache: !!input.shift });
      }
    }
  });

  windowProfiles.set(mainWindow.id, profile.id);
  mainWindow.loadURL('pens://app/renderer/index.html');

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.send('profile-info', profile);
    mainWindow.webContents.send('settings-loaded', settings);
    if (lockManager.isLocked(profile.id)) {
      mainWindow.setContentProtection(true);
      mainWindow.setTitle('कलम');
      mainWindow.hide();
      createLockWindow(profile.id);
    }
  });

  mainWindow.on('closed', () => {
    windowProfiles.delete(mainWindow.id);
  });
  mainWindow.on('minimize', () => {
    if (settings.lockOnMinimize) {
      setTimeout(() => lockProfileAutomatically(profileId, 'window minimized'), 250);
    }
  });
}

// Dialog & Store IPC
secureHandle('dialog:openPdf', null, async (e, profileId) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: [{ name: 'PDFs', extensions: ['pdf'] }]
  });
  return canceled ? null : filePaths[0];
});

secureHandle('dialog:open-home-background', null, async (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const result = await dialog.showOpenDialog(win, {
    title: 'Choose Home background',
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const filePath = result.filePaths[0];
  const stats = fs.statSync(filePath);
  if (stats.size > 8 * 1024 * 1024) throw new Error('Background image must be 8 MB or smaller.');
  const extension = path.extname(filePath).toLowerCase();
  const mime = extension === '.png' ? 'image/png'
    : extension === '.webp' ? 'image/webp' : 'image/jpeg';
  return `data:${mime};base64,${fs.readFileSync(filePath).toString('base64')}`;
});

secureHandle('pdf:read', z.tuple([z.string().max(4096)]), async (e, profileId, rawPath) => {
  try {
    let cleanPath = rawPath;
    if (cleanPath.startsWith('file:///')) {
      cleanPath = decodeURIComponent(cleanPath.replace(/^file:\/\/\//, ''));
    } else if (cleanPath.startsWith('file://')) {
      cleanPath = decodeURIComponent(cleanPath.replace(/^file:\/\//, ''));
    }
    cleanPath = path.normalize(cleanPath);
    if (!cleanPath.toLowerCase().endsWith('.pdf')) {
      throw new Error('Only PDF files are supported');
    }
    if (!fs.existsSync(cleanPath)) {
      throw new Error(`PDF file does not exist: ${cleanPath}`);
    }
    const stats = fs.statSync(cleanPath);
    if (stats.size > 200 * 1024 * 1024) {
      throw new Error('PDF file exceeds maximum allowed size (200MB)');
    }
    return fs.readFileSync(cleanPath);
  } catch (err) {
    console.error('Error in pdf:read:', err.message);
    return { error: err.message };
  }
});
secureHandle('pdf:export', z.tuple([z.string().max(4096), z.array(z.any()), z.array(z.any())]), async (e, profileId, sourcePath, annotations, strokes) => {
  const source = path.normalize(sourcePath);
  if (!source.toLowerCase().endsWith('.pdf') || !fs.existsSync(source)) {
    throw new Error('The source PDF does not exist.');
  }
  const win = BrowserWindow.fromWebContents(e.sender);
  const defaultPath = path.join(path.dirname(source), `${path.basename(source, '.pdf')}-annotated.pdf`);
  const result = await dialog.showSaveDialog(win, {
    title: 'Save annotated PDF',
    defaultPath,
    filters: [{ name: 'PDF document', extensions: ['pdf'] }]
  });
  if (result.canceled || !result.filePath) return null;

  const pdf = await PDFDocument.load(fs.readFileSync(source));
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pages = pdf.getPages();
  const parseColor = (value) => {
    const hex = typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.slice(1) : '1a73e8';
    return rgb(parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255);
  };
  for (const annotation of annotations) {
    const page = pages[Number(annotation.page) - 1];
    if (!page || typeof annotation.text !== 'string') continue;
    const { width, height } = page.getSize();
    page.drawText(annotation.text, {
      x: Math.max(0, Math.min(width - 180, Number(annotation.x) * width)),
      y: Math.max(0, Math.min(height - 18, height - Number(annotation.y) * height - 16)),
      size: 12,
      font,
      color: rgb(0.12, 0.12, 0.12)
    });
  }
  for (const stroke of strokes) {
    const page = pages[Number(stroke.page) - 1];
    if (!page || !Array.isArray(stroke.points) || stroke.points.length < 2) continue;
    const { width, height } = page.getSize();
    const color = parseColor(stroke.color);
    for (let i = 1; i < stroke.points.length; i++) {
      const a = stroke.points[i - 1];
      const b = stroke.points[i];
      page.drawLine({
        start: { x: Number(a[0]) * width, y: height - Number(a[1]) * height },
        end: { x: Number(b[0]) * width, y: height - Number(b[1]) * height },
        thickness: Math.max(0.5, Number(stroke.width) || 2),
        color,
        opacity: stroke.tool === 'highlighter' ? 0.35 : 1
      });
    }
  }
  fs.writeFileSync(result.filePath, await pdf.save());
  return result.filePath;
});
secureHandle('store:save', z.tuple([z.string().max(255), z.any()]), async (e, profileId, id, data) => store.saveNotes(profileId, id, data));
secureHandle('store:load', z.tuple([z.string().max(255)]), async (e, profileId, id) => store.loadNotes(profileId, id));
secureHandle('store:list', null, async (e, profileId) => store.listNotes(profileId));
secureHandle('get-username', null, async () => require('os').userInfo().username);

// Profile IPC
secureHandle('profiles:get-all', null, async () => profileManager.getProfiles());
secureHandle('profiles:get-current', null, async (e, profileId) => profileManager.getProfile(profileId));
secureHandle('profiles:create', z.tuple([z.string().max(50), z.string().max(30), z.string().max(30)]), async (e, profileId, name, color, avatar) => profileManager.createProfile(name, color, avatar));
secureHandle('profiles:update', z.tuple([z.object({
  displayName: z.string().trim().min(1).max(50),
  fullName: z.string().max(120),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  avatar: z.string().max(180000)
})]), async (e, profileId, fields) => {
  if (profileId === 'guest') throw new Error('Guest profile cannot be updated');
  if (fields.avatar && !/^[\p{L}\p{N}\p{Emoji_Presentation}\p{Extended_Pictographic}\s]+$/u.test(fields.avatar)
    && !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(fields.avatar)) {
    throw new Error('Invalid avatar format');
  }
  const updated = profileManager.updateProfile(profileId, fields);
  const win = BrowserWindow.fromWebContents(e.sender);
  if (win) win.setTitle(updated.displayName);
  for (const [windowId, activeProfileId] of windowProfiles.entries()) {
    if (activeProfileId === profileId) {
      const profileWindow = BrowserWindow.fromId(windowId);
      if (profileWindow) profileWindow.webContents.send('profile-info', updated);
    }
  }
  return updated;
});
secureHandle('profiles:delete', z.tuple([z.string().max(32)]), async (e, profileId, targetProfileId) => {
  requireRecentReauth(profileId, e.sender.id);
  if (targetProfileId !== profileId) throw new Error('Reauthenticate from the profile being deleted.');
  for (const win of getProfileWindows(profileId)) {
    if (!win.isDestroyed()) win.close();
  }
  const lockWindow = lockWindows.get(profileId);
  if (lockWindow && !lockWindow.isDestroyed()) lockWindow.close();
  reauthSessions.delete(reauthKey(profileId, e.sender.id));
  return profileManager.deleteProfile(profileId);
});
secureHandle('profiles:personal-details:get', z.tuple([z.string().url().max(2000)]), async (e, profileId, originUrl) => {
  const origin = new URL(originUrl).origin;
  if (!['http:', 'https:'].includes(new URL(originUrl).protocol)) throw new Error('Unsupported origin');
  const details = profileManager.getProfile(profileId).personalDetails || {};
  return details.origins.includes(origin)
    ? { origin, details: { ...details, origins: undefined } }
    : { origin, details: null };
});
secureHandle('profiles:personal-details:update', z.tuple([z.object({
  name: z.string().max(120),
  email: z.string().max(254),
  phone: z.string().max(40),
  address: z.string().max(300),
  origins: z.array(z.string().url().max(2000)).max(20)
})]), async (e, profileId, details) => profileManager.updatePersonalDetails(profileId, details));
secureHandle('profiles:open', z.tuple([z.string().max(32)]), async (e, currentProfile, targetProfileId) => {
  createWindow(targetProfileId);
  return true;
});
secureHandle('get-preload-path', null, async () => path.join(__dirname, '..', 'renderer', 'web-view-preload.js'));

// Bookmarks + History IPC
secureHandle('bookmarks:get', null, async (e, profileId) => bookmarksManager.load(profileId).bookmarks);
secureHandle('bookmarks:add', z.tuple([z.string().url().max(2000), z.string().max(200)]), async (e, profileId, url, title) => bookmarksManager.addBookmark(profileId, url, title));
secureHandle('bookmarks:remove', z.tuple([z.string().max(50)]), async (e, profileId, id) => bookmarksManager.removeBookmark(profileId, id));
secureHandle('history:add', z.tuple([z.string().url().max(2000), z.string().max(200).optional().default('')]), async (e, profileId, url, title) => historyManager.addVisit(profileId, url, title));
secureHandle('history:get', null, async (e, profileId) => historyManager.getHistory(profileId));
secureHandle('history:clear', null, async (e, profileId) => historyManager.clearHistory(profileId));

// Settings IPC
secureHandle('settings:get', null, async (e, profileId) => settingsManager.load(profileId));
secureHandle('settings:save', z.tuple([z.any()]), async (e, profileId, settings) => {
  const saved = settingsManager.save(profileId, settings);
  scheduleIdleLock(profileId);
  return saved;
});
secureHandle('home:fetch-feed', z.tuple([z.string().trim().max(120), z.enum(['news', 'jobs'])]), async (e, profileId, topic, kind) => {
  const query = [topic, kind === 'jobs' ? 'jobs internship' : 'news'].filter(Boolean).join(' ');
  const feedUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`;
  const response = await fetch(feedUrl, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`News feed returned HTTP ${response.status}.`);
  return (await response.text()).slice(0, 500000);
});

// Downloads IPC
secureHandle('downloads:get', null, async (e, profileId) => downloadsManager.load(profileId));

// Stage 4: Clear Browsing Data
secureHandle('privacy:clear-data', null, async (e, profileId) => {
    const partition = profileId === 'guest' ? 'guest' : `persist:${profileId}`;
    const profileSession = session.fromPartition(partition);
    await profileSession.clearStorageData();
    return true;
  });

const passwordsManager = require('./passwordsManager');
const syncManager = require('./syncManager');

// Passwords IPC
secureHandle('passwords:get', null, async (e, profileId) => passwordsManager.load(profileId));
secureHandle('passwords:add', z.tuple([z.string().url().max(2000), z.string().max(255), z.string().max(255)]), async (e, profileId, url, user, pass) => passwordsManager.addPassword(profileId, url, user, pass));

// Sync/Export IPC
secureHandle('sync:export', null, async (e, profileId) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Export Profile',
      defaultPath: 'profile.penprofile',
      filters: [{ name: 'कलम Profile', extensions: ['penprofile'] }]
    });
    if (!canceled && filePath) {
      await syncManager.exportProfile(profileId, filePath);
      return true;
    }
    return false;
  });

const fs = require('fs');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
secureHandle('webview:printToPdf', z.tuple([z.number()]), async (e, profileId, wcId) => {
  const { webContents } = require('electron');
  const wc = webContents.fromId(wcId);
  const parentWindow = BrowserWindow.fromWebContents(e.sender);
  if (!wc || wc.getType() !== 'webview' || wc.isDestroyed()) {
    throw new Error('The active web page is not ready for a snapshot.');
  }
  const owner = BrowserWindow.fromWebContents(wc.hostWebContents);
  if (!owner || windowProfiles.get(owner.id) !== profileId ||
      parentWindow?.id !== owner.id) {
    throw new Error('The selected web page does not belong to this profile.');
  }
  try {
    const data = await wc.printToPDF({ printBackground: true, pageSize: 'A4' });
    const pageTitle = wc.getTitle() || 'snapshot';
    const safeTitle = pageTitle.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim() || 'snapshot';
    const defaultPath = path.join(app.getPath('downloads'), `${safeTitle}.pdf`);
    const result = await dialog.showSaveDialog(parentWindow || undefined, {
      title: 'Save snapshot as PDF',
      defaultPath,
      filters: [{ name: 'PDF document', extensions: ['pdf'] }],
      properties: ['createDirectory', 'showOverwriteConfirmation']
    });
    if (result.canceled || !result.filePath) return null;
    const outputPath = result.filePath.toLowerCase().endsWith('.pdf') ? result.filePath : `${result.filePath}.pdf`;
    fs.writeFileSync(outputPath, data);
    return outputPath;
  } catch (err) {
    console.error('Failed to save snapshot PDF:', err);
    throw new Error(`Failed to save snapshot PDF: ${err.message}`);
  }
});

app.enableSandbox();

// Task 4.5: Command-line and file-association input
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Focus active window
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    
    // Parse arguments securely
    let targetProfile = profileManager.lastUsed;
    let targetFile = null;
    
    commandLine.forEach(arg => {
      if (arg.startsWith('--profile=')) {
        const p = arg.split('=')[1];
        if (/^[a-z0-9_-]{1,32}$/.test(p) && profileManager.getProfiles().some(x => x.id === p)) {
          targetProfile = p;
        }
      } else if (!arg.startsWith('-') && (arg.endsWith('.pdf') || arg.endsWith('.penprofile'))) {
        // Must be absolute and exist
        const absolutePath = require('path').resolve(workingDirectory, arg);
        if (require('fs').existsSync(absolutePath)) {
          targetFile = absolutePath;
        }
      }
    });
    
    if (targetFile) {
       // Future: open the file in the app securely
    } else if (targetProfile !== profileManager.lastUsed) {
       createWindow(targetProfile);
    }
  });
}


app.whenReady().then(() => {
  console.info('Hardware acceleration policy: not disabled by कलम; Chromium may fall back to software rendering.');
  console.info('GPU feature status:', app.getGPUFeatureStatus());
  app.getGPUInfo('complete').then(info => {
    console.info('GPU information:', info);
  }).catch(error => {
    console.warn('GPU information unavailable:', error.message);
  });
  lockManager.initialize();
  app.setAppUserModelId('com.nirmalyasinha.pens');
  setupPensProtocol(session.defaultSession);
  if (!protocol.isProtocolHandled('pens')) {
    protocol.handle('pens', handlePensRequest);
  }

  createWindow(profileManager.lastUsed);
  const handleSystemLock = (reason) => {
    for (const profileId of new Set(windowProfiles.values())) {
      if (settingsManager.load(profileId).lockOnSystemLock) lockProfileAutomatically(profileId, reason);
    }
  };
  powerMonitor.on('lock-screen', () => handleSystemLock('Windows lock screen'));
  powerMonitor.on('suspend', () => handleSystemLock('system suspend'));
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(profileManager.lastUsed);
  });
  
  app.on('web-contents-created', (event, contents) => {
    // Intercept keyboard reload shortcuts on all web contents (both shell window and webviews)
    contents.on('before-input-event', (e, input) => {
      if (input.type === 'keyDown') {
        const key = input.key.toLowerCase();
        if ((input.control && key === 'r') || key === 'f5') {
          e.preventDefault();
          if (contents.getType() === 'webview') {
            if (input.shift) {
              contents.reloadIgnoringCache();
            } else {
              contents.reload();
            }
          } else {
            contents.send('tab:reload-active', { ignoreCache: !!input.shift });
          }
        }
      }
      if (input.type === 'mouseWheel' && input.control) {
        const currentZoom = contents.getZoomFactor();
        const nextZoom = Math.min(5, Math.max(0.25, currentZoom + (input.deltaY < 0 ? 0.1 : -0.1)));
        e.preventDefault();
        contents.setZoomFactor(nextZoom);
      }
    });

    // Task 1.7: Remove debug surfaces in production
    if (app.isPackaged) {
      contents.on('devtools-opened', () => {
        contents.closeDevTools();
      });
    }

    // Task 1.2: Control navigation and popups
    contents.setWindowOpenHandler(({ url }) => {
      const parsedUrl = new URL(url);
      const allowedSchemes = ['http:', 'https:', 'mailto:'];
      if (allowedSchemes.includes(parsedUrl.protocol)) {
        createWindow(profileManager.lastUsed); // Normally open in same profile
        // Return deny so Electron doesn't spawn an unmanaged window
        return { action: 'deny' };
      }
      return { action: 'deny' };
    });

    contents.on('will-navigate', (event, navigationUrl) => {
      const parsedUrl = new URL(navigationUrl);
      if (['file:', 'javascript:', 'data:', 'devtools:'].includes(parsedUrl.protocol)) {
        event.preventDefault();
      }
    });

    // Task 1.1 / 1.2: Secure webviews
    contents.on('will-attach-webview', (event, webPreferences, params) => {
      // Force secure defaults on every webview
      delete webPreferences.preload;
      // Re-apply the secure preload explicitly
      webPreferences.preload = path.join(__dirname, '..', 'renderer', 'web-view-preload.js');
      
      webPreferences.contextIsolation = true;
      webPreferences.nodeIntegration = false;
      webPreferences.nodeIntegrationInSubFrames = false;
      webPreferences.nodeIntegrationInWorker = false;
      webPreferences.webSecurity = true;
      webPreferences.allowRunningInsecureContent = false;
      webPreferences.experimentalFeatures = false;
      webPreferences.safeDialogs = true;
      
      const parsedUrl = new URL(params.src);
      if (['file:', 'javascript:', 'data:', 'devtools:'].includes(parsedUrl.protocol) && parsedUrl.protocol !== 'pens:') {
        event.preventDefault();
      }
    });
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
