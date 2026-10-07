const { app, BrowserWindow, Menu, ipcMain, dialog, session, protocol, net, shell } = require('electron');
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

const windowProfiles = new Map();

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
      if (['privacy:clear-data', 'sync:export', 'passwords:get'].includes(channel)) {
        const key = `${profileId}:${channel}`;
        const lastCall = rateLimits.get(key) || 0;
        if (Date.now() - lastCall < 2000) throw new Error('Rate limit exceeded');
        rateLimits.set(key, Date.now());
      }
      let validatedArgs = [];
      if (schema) validatedArgs = schema.parse(args);
      return await handler(e, profileId, ...validatedArgs);
    } catch (err) {
      console.error(`IPC Validation Error on ${channel}:`, err.message);
      return { error: 'Validation failed' };
    }
  });
}

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
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      session: profileSession
    }
  });

  // Intercept Ctrl+R, F5, Ctrl+Shift+R on the main window so the shell never reloads
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown') {
      const key = input.key.toLowerCase();
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
  });

  mainWindow.on('closed', () => {
    windowProfiles.delete(mainWindow.id);
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
secureHandle('settings:save', z.tuple([z.any()]), async (e, profileId, settings) => settingsManager.save(profileId, settings));
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
      filters: [{ name: 'PenS Profile', extensions: ['penprofile'] }]
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
  if (!wc) return null;
  try {
    const data = await wc.printToPDF({ printBackground: true, pageSize: 'A4' });
    const pageTitle = wc.getTitle() || 'snapshot';
    const safeTitle = pageTitle.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim() || 'snapshot';
    const defaultPath = path.join(app.getPath('downloads'), `${safeTitle}.pdf`);
    const parentWindow = BrowserWindow.fromWebContents(e.sender);
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
  app.setAppUserModelId('com.nirmalyasinha.pens');
  setupPensProtocol(session.defaultSession);
  if (!protocol.isProtocolHandled('pens')) {
    protocol.handle('pens', handlePensRequest);
  }

  createWindow(profileManager.lastUsed);
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
