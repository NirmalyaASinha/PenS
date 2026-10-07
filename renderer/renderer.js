const tabsContainer = document.getElementById('tabs-container');
const newTabBtn = document.getElementById('new-tab-btn');
const contentArea = document.getElementById('content-area');
const addressBar = document.getElementById('address-bar');
const btnBack = document.getElementById('btn-back');
const btnForward = document.getElementById('btn-forward');
const btnReload = document.getElementById('btn-reload');
const btnZoomIn = document.getElementById('btn-zoom-in');
const btnZoomOut = document.getElementById('btn-zoom-out');
const btnMode = document.getElementById('btn-mode');
const btnOpenPdf = document.getElementById('btn-open-pdf');
const btnPdfText = document.getElementById('btn-pdf-text');
const btnPdfSave = document.getElementById('btn-pdf-save');
const btnUndo = document.getElementById('btn-undo');
const btnRedo = document.getElementById('btn-redo');
const btnPen = document.getElementById('btn-pen');
const btnHighlighter = document.getElementById('btn-highlighter');
const btnEraser = document.getElementById('btn-eraser');
const effectiveModeIndicator = document.getElementById('effective-mode-indicator');

function reportActivity(active = false, durationMs = 1800) {
  window.electronAPI?.reportActivity?.({ active, durationMs }).catch(() => {});
}

document.addEventListener('keydown', () => reportActivity(true), true);
document.addEventListener('pointerdown', () => reportActivity(true), true);
document.addEventListener('pointerup', () => reportActivity(false), true);

let tabs = [];
let activeTabId = null;
let tabCounter = 0;
let webviewPreloadPath = '';

function formatDate(timestamp) {
  if (!timestamp) return 'No date';
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }).format(new Date(timestamp));
}

function formatCount(value, singular, plural = `${singular}s`) {
  const count = Number(value) || 0;
  return `${count} ${count === 1 ? singular : plural}`;
}

function readableTitle(note) {
  const raw = String(note?.title || note?.source || note?.id || 'Untitled');
  if (note?.type === 'pdf' || /^file:/i.test(raw) || /^[a-zA-Z]:[\\/]/.test(raw)) {
    const filename = raw.replace(/^file:\/\/\//i, '').split(/[\\/]/).pop() || 'PDF document';
    return decodeURIComponent(filename).replace(/\.pdf$/i, '');
  }
  try {
    const url = new URL(raw);
    return url.hostname.replace(/^www\./i, '') || 'Web note';
  } catch {
    return raw.length > 72 ? `${raw.slice(0, 69)}...` : raw;
  }
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme || 'system';
}

function applyHomeBackground(tabId, settings = {}) {
  const home = document.getElementById(`home-container-${tabId}`);
  if (!home) return;
  const image = typeof settings.homeBackgroundImage === 'string' ? settings.homeBackgroundImage : '';
  home.classList.toggle('has-home-background', Boolean(image));
  home.style.backgroundImage = image ? `url("${image}")` : '';
}

function profileDisplayName(profile) {
  return String(profile?.displayName || profile?.name || 'Default').trim() || 'Default';
}

async function updateHomeGreeting(tabId) {
  const element = document.getElementById(`home-greeting-${tabId}`);
  if (!element) return;
  const profile = await window.electronAPI.getCurrentProfile?.().catch(() => null);
  const name = profileDisplayName(profile);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  element.textContent = `${greeting}, ${name}`;
}

function readableTextColor(hex) {
  const value = String(hex || '#1a73e8').slice(1);
  const red = parseInt(value.slice(0, 2), 16);
  const green = parseInt(value.slice(2, 4), 16);
  const blue = parseInt(value.slice(4, 6), 16);
  return (red * 299 + green * 587 + blue * 114) >= 150000 ? '#202124' : '#ffffff';
}

function updateProfileUI(profile) {
  currentProfile = profile;
  const displayName = profileDisplayName(profile);
  if (btnProfileMenu) {
    btnProfileMenu.replaceChildren();
    if (String(profile.avatar || '').startsWith('data:image/')) {
      const image = document.createElement('img');
      image.src = profile.avatar;
      image.alt = `${displayName} avatar`;
      image.width = 28;
      image.height = 28;
      image.style.cssText = 'width: 28px; height: 28px; border-radius: 50%; object-fit: cover;';
      btnProfileMenu.appendChild(image);
    } else {
      btnProfileMenu.textContent = profile.avatar || displayName.charAt(0).toUpperCase();
    }
    btnProfileMenu.title = displayName;
    btnProfileMenu.style.borderColor = profile.color;
  }
  document.documentElement.style.setProperty('--accent-color', profile.color);
  const titlebar = document.getElementById('titlebar');
  if (titlebar) {
    titlebar.style.backgroundColor = profile.color;
    titlebar.style.color = readableTextColor(profile.color);
  }
  document.querySelectorAll('[id^="home-greeting-"]').forEach((element) => {
    element.textContent = `Welcome back, ${displayName}`;
  });
  if (profile.identityConfigured === false && !sessionStorage.getItem('pens-identity-prompted')) {
    sessionStorage.setItem('pens-identity-prompted', 'true');
    setTimeout(() => createTab('pens://settings'), 0);
  }
}

async function resizeAvatarFile(file) {
  if (!file || !/^image\/(?:png|jpeg|webp|gif)$/i.test(file.type)) {
    throw new Error('Choose a PNG, JPEG, WebP, or GIF image.');
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('Avatar images must be 5 MB or smaller.');
  }
  const source = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = source;
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('The avatar image could not be read.'));
    });
    const size = Math.min(256, Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, size, size);
    const scale = Math.min(size / image.naturalWidth, size / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
    const encoded = canvas.toDataURL('image/webp', 0.82);
    if (encoded.length > 180000) throw new Error('That avatar is too large after processing.');
    return encoded;
  } finally {
    URL.revokeObjectURL(source);
  }
}

async function addIdentitySettings(tabId, page) {
  if (!page || !window.electronAPI?.getCurrentProfile || !window.electronAPI?.updateProfile) return;
  const profile = await window.electronAPI.getCurrentProfile();
  const section = document.createElement('section');
  section.className = 'identity-settings';
  const heading = document.createElement('h2');
  heading.textContent = 'You and कलम';
  const help = document.createElement('p');
  help.textContent = 'Choose how कलम shows your profile. These details stay with this profile.';
  help.className = 'settings-help';
  section.append(heading, help);

  const form = document.createElement('div');
  form.className = 'identity-form';
  const displayName = document.createElement('input');
  displayName.type = 'text';
  displayName.maxLength = 50;
  displayName.placeholder = 'Display name';
  displayName.value = profileDisplayName(profile);
  displayName.setAttribute('aria-label', 'Display name');
  const fullName = document.createElement('input');
  fullName.type = 'text';
  fullName.maxLength = 120;
  fullName.placeholder = 'Full name (optional)';
  fullName.value = profile.fullName || '';
  fullName.setAttribute('aria-label', 'Full name');

  const detailsHeading = document.createElement('h3');
  detailsHeading.textContent = 'Optional autofill details';
  const email = document.createElement('input');
  email.type = 'email';
  email.maxLength = 254;
  email.placeholder = 'Email';
  email.value = profile.personalDetails?.email || '';
  const phone = document.createElement('input');
  phone.type = 'tel';
  phone.maxLength = 40;
  phone.placeholder = 'Phone';
  phone.value = profile.personalDetails?.phone || '';
  const address = document.createElement('textarea');
  address.maxLength = 300;
  address.placeholder = 'Address';
  address.value = profile.personalDetails?.address || '';
  const origins = document.createElement('input');
  origins.type = 'text';
  origins.placeholder = 'Allowed origins, comma-separated (example: https://example.com)';
  origins.value = (profile.personalDetails?.origins || []).join(', ');
  const detailsHelp = document.createElement('small');
  detailsHelp.className = 'settings-help';
  detailsHelp.textContent = 'कलम only offers these details after you focus a field, and only on the exact origins listed here.';

  const avatarLabel = document.createElement('label');
  avatarLabel.textContent = 'Avatar';
  const avatarText = document.createElement('input');
  avatarText.type = 'text';
  avatarText.maxLength = 8;
  avatarText.placeholder = 'Initials or emoji';
  avatarText.value = String(profile.avatar || '').startsWith('data:image/') ? '' : (profile.avatar || '');
  avatarText.setAttribute('aria-label', 'Avatar initials or emoji');
  const avatarFile = document.createElement('input');
  avatarFile.type = 'file';
  avatarFile.accept = 'image/png,image/jpeg,image/webp,image/gif';
  avatarFile.setAttribute('aria-label', 'Upload avatar image');
  const avatarStatus = document.createElement('small');
  avatarStatus.className = 'settings-help';
  avatarStatus.textContent = 'PNG, JPEG, WebP, or GIF up to 5 MB; कलम stores a resized copy.';
  let uploadedAvatar = String(profile.avatar || '').startsWith('data:image/') ? profile.avatar : '';
  avatarFile.addEventListener('change', async () => {
    try {
      uploadedAvatar = await resizeAvatarFile(avatarFile.files[0]);
      avatarText.value = '';
      avatarStatus.textContent = 'Avatar ready. Save settings to apply it.';
    } catch (error) {
      avatarFile.value = '';
      avatarStatus.textContent = error.message;
    }
  });

  const colorLabel = document.createElement('label');
  colorLabel.textContent = 'Profile color';
  const color = document.createElement('input');
  color.type = 'color';
  color.value = /^#[0-9a-f]{6}$/i.test(profile.color || '') ? profile.color : '#1a73e8';
  color.setAttribute('aria-label', 'Profile color');
  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'settings-primary-button';
  save.textContent = 'Save identity';
  const status = document.createElement('p');
  status.className = 'settings-help';
  save.addEventListener('click', async () => {
    const name = displayName.value.trim();
    if (!name) {
      status.textContent = 'Enter a display name first.';
      displayName.focus();
      return;
    }
    const avatar = uploadedAvatar || avatarText.value.trim() || name.slice(0, 2).toUpperCase();
    if (avatar.length > 8 && !avatar.startsWith('data:image/')) {
      status.textContent = 'Use up to 8 characters for initials or an emoji.';
      return;
    }
    save.disabled = true;
    try {
      const updated = await window.electronAPI.updateProfile({
        displayName: name,
        fullName: fullName.value.trim(),
        avatar,
        color: color.value
      });
      if (!updated || updated.error) throw new Error('The profile identity could not be saved.');
      updateProfileUI(updated);
      const originList = origins.value.split(',').map(value => value.trim()).filter(Boolean);
      const validOrigins = originList.filter(value => {
        try {
          const parsed = new URL(value);
          return ['http:', 'https:'].includes(parsed.protocol) && parsed.origin === value.replace(/\/$/, '');
        } catch {
          return false;
        }
      });
      if (validOrigins.length !== originList.length) {
        status.textContent = 'Identity saved, but one or more origins were invalid.';
      }
      await window.electronAPI.updatePersonalDetails({
        name: fullName.value.trim(),
        email: email.value.trim(),
        phone: phone.value.trim(),
        address: address.value.trim(),
        origins: validOrigins
      });
      currentProfile.personalDetails = { name: fullName.value.trim(), email: email.value.trim(), phone: phone.value.trim(), address: address.value.trim(), origins: validOrigins };
      status.textContent = 'Identity updated.';
    } catch (error) {
      status.textContent = `Unable to save identity: ${error.message}`;
    } finally {
      save.disabled = false;
    }
  });

  form.append(displayName, fullName, detailsHeading, email, phone, address, origins, detailsHelp, avatarLabel, avatarText, avatarFile, avatarStatus, colorLabel, color, save, status);
  section.appendChild(form);
  page.prepend(section);
}

// --- Input Manager (Auto Switching) ---
window.appMode = 'auto'; // 'auto' | 'pen-lock' | 'browse-lock'
window.effectiveMode = 'browse'; // 'pen' | 'browse'
window.isEraser = false;
let currentTool = 'pen'; // 'pen' | 'highlighter'

let lastPenTime = 0;
let penLeaveTimeout = null;
let mouseSensed = false;
let penSensed = false;

function setAppMode(mode) {
  window.appMode = mode;
  btnMode.className = `mode-${mode}`;
  const labels = { 'auto': 'Auto', 'pen-lock': 'Pen Lock', 'browse-lock': 'Browse Lock' };
  btnMode.textContent = labels[mode];
  evaluateEffectiveMode();
}

function updateEffectiveMode(mode) {
  if (window.effectiveMode !== mode) {
    window.effectiveMode = mode;
    if (effectiveModeIndicator) {
      effectiveModeIndicator.style.backgroundColor = mode === 'pen' ? '#1a73e8' : '#ccc';
    }
    
    // Broadcast to active tab
    const tab = getActiveTab();
    if (tab) {
      if (tab.pdfViewer) tab.pdfViewer.setMode(mode);
      if (tab.webview && tab.webview.send) tab.webview.send('set-mode', mode);
    }
  }
}

function evaluateEffectiveMode() {
  if (window.appMode === 'pen-lock') return updateEffectiveMode('pen');
  if (window.appMode === 'browse-lock') return updateEffectiveMode('browse');
}

window.handlePointerActivity = function(data) {
  if (data.type === 'pen') penSensed = true;
  if (data.type === 'mouse') mouseSensed = true;

  if (window.appMode !== 'auto') return;

  const now = Date.now();
  if (data.type === 'pen') {
    lastPenTime = now;
    clearTimeout(penLeaveTimeout);
    updateEffectiveMode('pen');
  } else if (data.type === 'mouse' && (data.buttons > 0 || data.isMove)) {
    if (now - lastPenTime > 300) {
      if (now - lastPenTime > 600) {
        updateEffectiveMode('browse');
      }
    }
  }
};

window.handlePointerLeave = function(data) {
  if (window.appMode !== 'auto') return;
  if (data.type === 'pen') {
    clearTimeout(penLeaveTimeout);
    penLeaveTimeout = setTimeout(() => {
      updateEffectiveMode('browse');
    }, 3000);
  }
};

btnMode.addEventListener('click', () => {
  const modes = ['auto', 'pen-lock', 'browse-lock'];
  setAppMode(modes[(modes.indexOf(window.appMode) + 1) % 3]);
});

btnPdfText.addEventListener('click', () => {
  const tab = getActiveTab();
  if (!tab || !tab.pdfViewer) return;
  const enabled = !tab.pdfViewer.textToolEnabled;
  tab.pdfViewer.setTextTool(enabled);
  btnPdfText.classList.toggle('selected', enabled);
  btnPdfText.title = enabled ? 'Click a PDF page to add text' : 'Add text comment to PDF';
});

btnPdfSave.addEventListener('click', () => {
  savePdfAnnotations(getActiveTab()).catch((error) => {
    console.error('Unable to save PDF annotations:', error);
    alert(`Unable to save PDF annotations: ${error.message}`);
  });
});

// --- Shortcuts & Zoom ---
let currentZoom = 1;
function applyZoom(delta) {
  const tab = getActiveTab();
  if (!tab) return;
  if (delta === 0) currentZoom = 1;
  else currentZoom += delta;
  
  if (currentZoom < 0.25) currentZoom = 0.25;
  if (currentZoom > 5) currentZoom = 5;

  if (tab.webview) {
    tab.webview.setZoomLevel(Math.log(currentZoom) / Math.log(1.2));
  } else if (tab.pdfViewer) {
    tab.pdfViewer.setZoom(currentZoom * 1.5);
  }
}

window.addEventListener('wheel', (event) => {
  if (!event.ctrlKey) return;
  event.preventDefault();
  event.stopPropagation();
  applyZoom(event.deltaY < 0 ? 0.1 : -0.1);
}, { passive: false });

contentArea.addEventListener('wheel', (event) => {
  if (!event.ctrlKey) return;
  event.preventDefault();
  event.stopPropagation();
  applyZoom(event.deltaY < 0 ? 0.1 : -0.1);
}, { passive: false, capture: true });

btnZoomIn.addEventListener('click', () => applyZoom(0.2));
btnZoomOut.addEventListener('click', () => applyZoom(-0.2));

window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  // Intercept reload shortcuts globally so the app window never refreshes
  if ((e.ctrlKey && key === 'r') || key === 'f5') {
    e.preventDefault();
    e.stopPropagation();
    reloadActiveTab({ ignoreCache: !!e.shiftKey });
    return;
  }

  if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') {
    if (e.key === 'Enter' && document.activeElement === addressBar) navigateTo(addressBar.value);
    return;
  }
  const tab = getActiveTab();
  if (e.ctrlKey) {
    if (e.key === '=' || e.key === '+') { e.preventDefault(); applyZoom(0.2); }
    if (e.key === '-') { e.preventDefault(); applyZoom(-0.2); }
    if (e.key === '0') { e.preventDefault(); applyZoom(0); }
    if (e.key === 'z') { tab && tab.pdfViewer ? tab.pdfViewer.undo() : tab?.webview?.send?.('undo'); }
    if (e.key === 'y') { tab && tab.pdfViewer ? tab.pdfViewer.redo() : tab?.webview?.send?.('redo'); }
    if (e.key.toLowerCase() === 't') { 
      e.preventDefault(); 
      if (e.shiftKey) {
        if (closedTabs.length > 0) createTab(closedTabs.pop());
      } else {
        createTab(); 
      }
    }
    if (e.key.toLowerCase() === 'w') { e.preventDefault(); if (activeTabId) closeTab(activeTabId); }
    if (e.key.toLowerCase() === 'h') { e.preventDefault(); createTab('pens://history'); }
    if (e.key.toLowerCase() === 'l') { e.preventDefault(); addressBar.focus(); addressBar.select(); }
    if (e.key.toLowerCase() === 'f') { 
      // Basic find in page
      e.preventDefault(); 
      const query = prompt("Find in page:");
      if (query && tab && tab.webview) tab.webview.findInPage(query);
    }
    if (e.shiftKey && e.key.toLowerCase() === 'i') {
      if (tab && tab.webview) tab.webview.openDevTools();
    }
  } else {
    switch (e.key.toLowerCase()) {
      case 'p': setAppMode(window.appMode === 'auto' ? 'pen-lock' : window.appMode === 'pen-lock' ? 'browse-lock' : 'auto'); break;
      case 'e': toggleTool('eraser'); break;
      case 'h': toggleTool('highlighter'); break;
      case 'b': toggleTool('pen'); break;
      case ']': currentSize = Math.min(40, currentSize + 0.5); if (typeof updateSizeDisplay === 'function') updateSizeDisplay(currentSize); broadcastStyle(); break;
      case '[': currentSize = Math.max(1, currentSize - 0.5); if (typeof updateSizeDisplay === 'function') updateSizeDisplay(currentSize); broadcastStyle(); break;
    }
  }
});

function toggleTool(tool) {
  btnPen.classList.remove('active');
  btnHighlighter.classList.remove('active');
  btnEraser.classList.remove('active');

  window.isEraser = false;
  
  if (tool === 'eraser') {
    window.isEraser = true;
    btnEraser.classList.add('active');
  } else if (tool === 'highlighter') {
    currentTool = 'highlighter';
    btnHighlighter.classList.add('active');
    // Auto-switch to a thick yellow
    currentColor = '#fbbc04'; 
    currentSize = 20;
    if (typeof updateSizeDisplay === 'function') updateSizeDisplay(currentSize);
    updateSwatches();
  } else {
    currentTool = 'pen';
    btnPen.classList.add('active');
    if (currentSize === 20) currentSize = 2.5; // switch back size
    if (typeof updateSizeDisplay === 'function') updateSizeDisplay(currentSize);
  }
  
  const tab = getActiveTab();
  if (tab) {
    if (tab.pdfViewer) tab.pdfViewer.setEraser(window.isEraser);
    if (tab.webview && tab.webview.send) tab.webview.send('set-eraser', window.isEraser);
  }
  broadcastStyle();
}

btnPen.addEventListener('click', () => toggleTool('pen'));
btnHighlighter.addEventListener('click', () => toggleTool('highlighter'));
btnEraser.addEventListener('click', () => toggleTool('eraser'));

btnUndo.addEventListener('click', () => { const tab = getActiveTab(); if (tab) { tab.pdfViewer ? tab.pdfViewer.undo() : tab.webview?.send?.('undo'); } });
btnRedo.addEventListener('click', () => { const tab = getActiveTab(); if (tab) { tab.pdfViewer ? tab.pdfViewer.redo() : tab.webview?.send?.('redo'); } });

const btnSnapshot = document.getElementById('btn-snapshot');

btnSnapshot.addEventListener('click', async () => {
  const tab = getActiveTab();
  if (!tab?.webview) {
    alert('Snap works on an open web page. Open a website first.');
    return;
  }
  btnSnapshot.style.opacity = '0.5';
  btnSnapshot.disabled = true;
  try {
    const wcId = tab.webview.getWebContentsId();
    const pdfPath = await window.electronAPI.printToPdf(wcId);
    if (pdfPath) createPdfTab(pdfPath);
  } catch (error) {
    console.error('Failed to snapshot page:', error);
    alert(`Unable to save snapshot PDF: ${error.message}`);
  } finally {
    btnSnapshot.disabled = false;
    btnSnapshot.style.opacity = '1';
  }
});

btnOpenPdf.addEventListener('click', async () => {
  if (window.electronAPI && window.electronAPI.openPdf) {
    const filePath = await window.electronAPI.openPdf();
    if (filePath) createPdfTab(filePath);
  }
});

// --- Tab Management ---
const btnSaveToggle = document.getElementById('btn-save-toggle');
let closedTabs = []; // Stack for closed tabs

function updateSaveToggleUI(tab) {
  if (!tab || tab.isPdf || tab.url === 'pens://home' || tab.url.startsWith('pens://')) {
    btnSaveToggle.style.display = 'none';
  } else {
    btnSaveToggle.style.display = 'flex';
    if (tab.saveEnabled) {
      btnSaveToggle.classList.add('active');
      const urlId = tab.url ? tab.url.split('?')[0].split('#')[0] : '';
      btnSaveToggle.title = `Keep notes for this website (On - Will be saved for next visit)\nSaved to: ${urlId}`;
    } else {
      btnSaveToggle.classList.remove('active');
      btnSaveToggle.title = `Keep notes for this website (Off - Click to save for next visit)`;
    }
  }
}

btnSaveToggle.addEventListener('click', async () => {
  const tab = getActiveTab();
  if (tab && !tab.isPdf && !tab.url.startsWith('pens://')) {
    tab.saveEnabled = !tab.saveEnabled;
    updateSaveToggleUI(tab);
    if (tab.saveEnabled) {
      const urlId = tab.url ? tab.url.split('?')[0].split('#')[0] : '';
      if (urlId && tab.currentStrokes && tab.currentStrokes.length > 0) {
        const data = {
          version: 1,
          source: { type: 'web', url: tab.url },
          strokes: tab.currentStrokes,
          thumbnail: tab.currentThumbnail || ''
        };
        await window.electronAPI.saveNotes(urlId, data);
      }
    }
  }
});

function promptUnsavedSketch(tab) {
  return new Promise((resolve) => {
    if (!tab || tab.isPdf || !tab.url || tab.url.startsWith('pens://')) {
      return resolve('proceed');
    }
    // If the user already enabled saving for this website, notes are kept
    if (tab.saveEnabled) {
      return resolve('proceed');
    }
    // Check if there are actual strokes on the page
    const hasStrokes = tab.currentStrokes && tab.currentStrokes.length > 0;
    if (!hasStrokes) {
      return resolve('proceed');
    }

    const modal = document.getElementById('sketch-prompt-modal');
    const pageInfo = document.getElementById('modal-page-info');
    const btnSave = document.getElementById('modal-btn-save');
    const btnPdf = document.getElementById('modal-btn-pdf');
    const btnDiscard = document.getElementById('modal-btn-discard');
    const btnCancel = document.getElementById('modal-btn-cancel');

    if (!modal) return resolve('proceed');

    pageInfo.textContent = tab.url;
    modal.style.display = 'flex';

    const cleanup = () => {
      modal.style.display = 'none';
      btnSave.onclick = null;
      btnPdf.onclick = null;
      btnDiscard.onclick = null;
      btnCancel.onclick = null;
    };

    btnSave.onclick = async () => {
      cleanup();
      const urlId = tab.url.split('?')[0].split('#')[0];
      const data = {
        version: 1,
        source: { type: 'web', url: tab.url },
        strokes: tab.currentStrokes,
        thumbnail: tab.currentThumbnail || ''
      };
      await window.electronAPI.saveNotes(urlId, data);
      tab.saveEnabled = true;
      updateSaveToggleUI(tab);
      resolve('proceed');
    };

    btnPdf.onclick = async () => {
      cleanup();
      if (tab.webview && window.electronAPI && window.electronAPI.printToPdf) {
        try {
          const wcId = tab.webview.getWebContentsId();
          const pdfPath = await window.electronAPI.printToPdf(wcId);
          if (pdfPath) {
            alert(`Sketch exported to PDF:\n${pdfPath}`);
          }
        } catch (err) {
          console.error('Failed to export PDF:', err);
        }
      }
      resolve('proceed');
    };

    btnDiscard.onclick = () => {
      cleanup();
      resolve('proceed');
    };

    btnCancel.onclick = () => {
      cleanup();
      resolve('cancel');
    };
  });
}

function getActiveTab() { return tabs.find(t => t.id === activeTabId); }

function createPdfTab(filePath) {
  const tabId = `tab-${tabCounter++}`;
  const tabEl = document.createElement('div');
  tabEl.className = 'tab';
  tabEl.id = tabId;
  
  const titleEl = document.createElement('span');
  titleEl.className = 'tab-title';
  titleEl.textContent = filePath.split('\\').pop().split('/').pop();
  
  const closeEl = document.createElement('span');
  closeEl.className = 'tab-close';
  closeEl.innerHTML = '&times;';
  closeEl.onclick = (e) => { e.stopPropagation(); closeTab(tabId); };
  
  tabEl.appendChild(titleEl);
  tabEl.appendChild(closeEl);
  tabEl.onclick = () => activateTab(tabId);
  tabsContainer.insertBefore(tabEl, newTabBtn);
  
  const viewContainer = document.createElement('div');
  viewContainer.className = 'view-container';
  viewContainer.id = `view-${tabId}`;
  contentArea.appendChild(viewContainer);
  
  const fileUrl = 'file:///' + filePath.replace(/\\/g, '/');
  const tabObj = { id: tabId, el: tabEl, viewEl: viewContainer, titleEl, isPdf: true, url: fileUrl, filePath };
  tabs.push(tabObj);
  
  if (window.PDFViewer) {
    tabObj.pdfViewer = new window.PDFViewer(viewContainer, filePath, fileUrl);
    tabObj.pdfViewer.ready.then(async () => {
      const settings = await window.electronAPI.getSettings().catch(() => ({}));
      tabObj.pdfViewer.setPerformanceMode(settings.performanceMode === true);
      const saved = await window.electronAPI.loadNotes(filePath);
      if (saved && saved.source && saved.source.type === 'pdf') {
        tabObj.pdfViewer.setAnnotations(saved.annotations);
      }
    }).catch((error) => console.error('Unable to restore PDF annotations:', error));
  } else {
    setTimeout(() => {
      if (window.PDFViewer && !tabObj.pdfViewer) {
        tabObj.pdfViewer = new window.PDFViewer(viewContainer, filePath, fileUrl);
        window.electronAPI.getSettings().then(settings => {
          tabObj.pdfViewer.setPerformanceMode(settings.performanceMode === true);
        }).catch(() => {});
      }
    }, 100);
  }
  activateTab(tabId);
}

async function savePdfAnnotations(tab) {
  if (!tab || !tab.pdfViewer) return;
  await tab.pdfViewer.ready;
  const exportedPath = await window.electronAPI.exportPdf(
    tab.filePath,
    tab.pdfViewer.getAnnotations(),
    tab.pdfViewer.getStrokes()
  );
  if (!exportedPath) return;
  await window.electronAPI.saveNotes(tab.filePath, {
    version: 1,
    source: { type: 'pdf', path: tab.filePath, title: tab.titleEl.textContent },
    annotations: tab.pdfViewer.getAnnotations(),
    strokes: tab.pdfViewer.getStrokes()
  });
  btnPdfSave.textContent = 'Saved PDF';
  setTimeout(() => { btnPdfSave.textContent = 'Save'; }, 1200);
  return exportedPath;
}

// Resolve URL or Search Query (Default to Google)
function resolveSearchOrUrl(input) {
  if (!input) return '';
  const trimmed = input.trim();
  if (!trimmed) return '';

  // Internal and standard protocols
  if (/^(pens|about):/i.test(trimmed)) return trimmed;
  if (/^file:\/\//i.test(trimmed)) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  // Localhost / Loopback
  if (/^localhost(:\d+)?(\/.*)?$/i.test(trimmed) || /^127\.0\.0\.1(:\d+)?(\/.*)?$/.test(trimmed)) {
    return 'http://' + trimmed;
  }

  // Spaces indicate a search query -> Default to Google
  if (/\s/.test(trimmed)) {
    return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
  }

  // Domain structure test (e.g. google.com, sub.domain.org/path)
  const domainPattern = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+(:[0-9]+)?(\/.*)?$/;
  if (domainPattern.test(trimmed)) {
    const hasValidTld = /\.[a-z]{2,24}(:[0-9]+)?(\/.*)?$/i.test(trimmed);
    if (hasValidTld || trimmed.includes('/') || trimmed.includes(':')) {
      return 'https://' + trimmed;
    }
  }

  // Otherwise, default to Google search
  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
}

function createTab(url = 'pens://home') {
  if (url && url !== 'pens://home') {
    url = resolveSearchOrUrl(url);
  }
  const tabId = `tab-${tabCounter++}`;
  const tabEl = document.createElement('div');
  tabEl.className = 'tab';
  tabEl.id = tabId;
  
  const titleEl = document.createElement('span');
  titleEl.className = 'tab-title';
  titleEl.textContent = url === 'pens://home' ? 'Home' : 'Loading...';
  
  const closeEl = document.createElement('span');
  closeEl.className = 'tab-close';
  closeEl.innerHTML = '&times;';
  closeEl.onclick = async (e) => { e.stopPropagation(); await closeTab(tabId); };
  
  tabEl.appendChild(titleEl);
  tabEl.appendChild(closeEl);
  tabEl.onclick = () => activateTab(tabId);
  tabsContainer.insertBefore(tabEl, newTabBtn);
  
  const viewContainer = document.createElement('div');
  viewContainer.className = 'view-container';
  viewContainer.id = `view-${tabId}`;
  
  const tabObj = { id: tabId, el: tabEl, viewEl: viewContainer, titleEl, url, saveEnabled: false, currentStrokes: [], currentThumbnail: '' };
  
  if (url === 'pens://home') {
    viewContainer.innerHTML = `
      <div class="home-container" id="home-container-${tabId}" style="display: flex; height: 100%; font-family: 'Segoe UI', sans-serif; background: #fff;">
        <div class="home-left" style="flex: 1; padding: 40px; border-right: 1px solid #eee; display: flex; flex-direction: column;">
          <div style="background: #f8f9fa; border-radius: 16px; padding: 30px; text-align: center; transition: transform 0.2s;" id="home-browse-card-${tabId}">
            <h1 style="margin: 0 0 20px 0; font-size: 32px; color: #1a73e8; font-weight: 600;">Browse the Web</h1>
            <form id="home-search-form-${tabId}" style="margin: 0; display: flex; justify-content: center;" onsubmit="event.preventDefault();">
              <div style="background: white; border: 1.5px solid #dfe1e5; border-radius: 24px; padding: 10px 18px; display: flex; align-items: center; width: 100%; max-width: 480px; box-shadow: 0 2px 6px rgba(0,0,0,0.06);" class="home-search-capsule">
                <span style="color: #5f6368; margin-right: 12px; font-size: 16px;">🔍</span>
                <input 
                  type="text" 
                  id="home-search-input-${tabId}" 
                  placeholder="Search Google or enter web address..." 
                  style="flex: 1; border: none; outline: none; font-size: 15px; color: #202124; background: transparent; font-family: inherit; width: 100%; min-width: 0;" 
                  autocomplete="off"
                  spellcheck="false"
                />
                <button type="submit" class="home-search-btn">Search</button>
              </div>
            </form>
          </div>
          
          <h3 style="margin-top: 40px; color: #333;">Bookmarks</h3>
          <div id="home-bookmarks-${tabId}" class="home-bookmarks-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap: 16px; margin-top: 16px;"></div>
          <section class="home-feed-panel" id="home-feed-${tabId}">
            <div class="home-feed-header"><div><h3>Latest for you</h3><p>Current headlines and opportunities.</p></div><div class="home-feed-header-actions"><button id="home-feed-focus-${tabId}" class="home-feed-focus" title="Open focused news and jobs view">◉ Focus</button><button id="home-feed-refresh-${tabId}" class="home-feed-refresh">Refresh</button></div></div>
            <div class="home-feed-controls"><label class="home-feed-topic-label" for="home-feed-topic-${tabId}">Filter by topic</label><input id="home-feed-topic-${tabId}" type="text" maxlength="120" placeholder="Technology, design, finance..." aria-label="News topic"><button id="home-feed-save-${tabId}" class="home-feed-save">Save filter</button></div>
            <p id="home-feed-filter-status-${tabId}" class="home-feed-filter-status" role="status"></p>
            <div class="home-feed-columns"><div><h4>News</h4><div id="home-news-list-${tabId}" class="home-feed-list"><p class="home-feed-empty">Loading headlines...</p></div><button id="home-feed-news-${tabId}" class="home-feed-load">Load news</button></div><div><h4>Jobs & internships</h4><div id="home-jobs-list-${tabId}" class="home-feed-list"><p class="home-feed-empty">Loading opportunities...</p></div><button id="home-feed-jobs-${tabId}" class="home-feed-load">Load jobs</button></div></div>
          </section>
        </div>
        
        <div class="home-right" style="flex: 1.5; padding: 40px; background: #fafafa; display: flex; flex-direction: column; overflow-y: auto;">
          <h1 id="home-greeting-${tabId}" style="margin: 0; font-size: 28px; color: #202124;">Welcome back</h1>
          <p style="color: #5f6368; font-size: 16px; margin-top: 8px;">How is your day?</p>
          
          <div id="home-continue-${tabId}" style="margin-top: 30px; display: none;">
            <h3 style="color: #333; margin-bottom: 12px;">Continue where you left off</h3>
            <div id="continue-card-${tabId}" style="background: white; border: 1px solid #ddd; border-radius: 12px; padding: 16px; cursor: pointer; display: flex; align-items: center; box-shadow: 0 2px 4px rgba(0,0,0,0.05);"></div>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 40px;">
            <h3 style="margin: 0; color: #333;">My notes</h3>
            <a href="#" id="home-see-all-${tabId}" style="color: #1a73e8; text-decoration: none; font-weight: 500;">See all →</a>
          </div>
          
          <div id="notes-grid-${tabId}" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 20px; margin-top: 20px;"></div>
        </div>
      </div>
    `;
    /*
      <div class="home-container">
        <div class="home-left">
          <button class="home-browse-btn" id="home-browse-${tabId}">Browse</button>
          <div class="home-bookmarks">Bookmarks</div>
        </div>
        <div class="home-right">
          <div class="home-title">Welcome to कलम ! Updated</div>
          <div class="home-subtitle" id="home-subtitle-${tabId}">Hey User</div>
          <div class="home-notes-title">Notebooks</div>
          <div class="notes-grid" id="notes-grid-${tabId}"></div>
        </div>
      </div>
    `;
    */
    contentArea.appendChild(viewContainer);
    tabs.push(tabObj);
    // ... Home init logic (same as before) ...
    setTimeout(async () => {
      /*
      document.getElementById(`home-browse-${tabId}`).addEventListener('click', () => {
        addressBar.focus();
        addressBar.select();
      });
      
      if (window.electronAPI) {
        const topicInput = document.getElementById(`home-feed-topic-${tabId}`);
        let savedSettings = await window.electronAPI.getSettings().catch(() => ({}));
        topicInput.value = savedSettings.newsTopic || 'technology';
        const filterStatus = document.getElementById(`home-feed-filter-status-${tabId}`);
        const parseFeed = (xml) => {
          const doc = new DOMParser().parseFromString(xml, 'text/xml');
          return Array.from(doc.querySelectorAll('item')).slice(0, 6).map(item => ({
            title: item.querySelector('title')?.textContent?.trim() || 'Untitled',
            link: item.querySelector('link')?.textContent?.trim() || '',
            date: item.querySelector('pubDate')?.textContent?.trim() || ''
          }));
        };
        const renderFeed = (list, items) => {
          list.replaceChildren();
          if (!items.length) { list.innerHTML = '<p class="home-feed-empty">No matching results.</p>'; return; }
          items.forEach(item => {
            const card = document.createElement('a');
            card.className = 'home-feed-item';
            card.href = item.link;
            card.target = '_blank';
            card.rel = 'noopener noreferrer';
            const title = document.createElement('strong');
            title.textContent = item.title;
            const date = document.createElement('small');
            date.textContent = item.date ? new Date(item.date).toLocaleDateString() : 'Latest';
            card.append(title, date);
            list.appendChild(card);
          });
        };
        const loadFeed = async (kind, target) => {
          const topic = topicInput.value.trim();
          if (!topic) { target.innerHTML = '<p class="home-feed-empty">Enter a topic first.</p>'; topicInput.focus(); return; }
          target.innerHTML = '<p class="home-feed-empty">Loading...</p>';
          try {
            renderFeed(target, parseFeed(await window.electronAPI.fetchHomeFeed(topic, kind)));
          } catch (error) {
            console.error('Unable to load home feed:', error);
            target.innerHTML = '<p class="home-feed-empty">Feed unavailable. Check your connection and try again.</p>';
          }
        };
        const newsList = document.getElementById(`home-news-list-${tabId}`);
        const jobsList = document.getElementById(`home-jobs-list-${tabId}`);
        document.getElementById(`home-feed-save-${tabId}`).onclick = async () => {
          const topic = topicInput.value.trim();
          if (!topic) {
            filterStatus.textContent = 'Enter a topic before saving the filter.';
            topicInput.focus();
            return;
          }
          savedSettings = await window.electronAPI.saveSettings({ ...savedSettings, newsTopic: topic });
          filterStatus.textContent = `Saved filter: ${topic}`;
          await Promise.all([loadFeed('news', newsList), loadFeed('jobs', jobsList)]);
        };
        document.getElementById(`home-feed-news-${tabId}`).onclick = () => loadFeed('news', newsList);
        document.getElementById(`home-feed-jobs-${tabId}`).onclick = () => loadFeed('jobs', jobsList);
        document.getElementById(`home-feed-focus-${tabId}`).onclick = () => createTab('pens://focus');
        document.getElementById(`home-feed-refresh-${tabId}`).onclick = () => {
          loadFeed('news', newsList);
          loadFeed('jobs', jobsList);
        };
        if (topicInput.value) {
          loadFeed('news', newsList);
          loadFeed('jobs', jobsList);
        }
        if (window.electronAPI.getUsername) {
          const username = await window.electronAPI.getUsername();
          document.getElementById(`home-subtitle-${tabId}`).textContent = `Hey ${username}`;
        }
        if (window.electronAPI.listNotes) {
          const grid = document.getElementById(`notes-grid-${tabId}`);
          try {
            const notes = await window.electronAPI.listNotes();
            notes.forEach(note => {
              const card = document.createElement('div');
              card.className = 'note-card';
              let displayName = note.id;
              try {
                 if (note.type === 'web') displayName = new URL(note.id).hostname || note.id;
                 else displayName = note.id.split('\\').pop().split('/').pop();
              } catch(e) {}
              card.textContent = `${displayName} (${note.strokeCount} strokes)`;
              card.onclick = () => {
                if (note.type === 'web') createTab(note.id);
                else createPdfTab(note.id);
              };
              grid.appendChild(card);
            });
          } catch(e) { console.error(e); }
        }
      }
      */
      const homeSearchForm = document.getElementById(`home-search-form-${tabId}`);
      const homeSearchInput = document.getElementById(`home-search-input-${tabId}`);
      const homeBrowseCard = document.getElementById(`home-browse-card-${tabId}`);

      if (homeSearchForm && homeSearchInput) {
        homeSearchForm.addEventListener('submit', (e) => {
          e.preventDefault();
          const query = homeSearchInput.value.trim();
          if (query) {
            navigateTo(query);
          }
        });

        if (homeBrowseCard) {
          homeBrowseCard.addEventListener('click', (e) => {
            if (e.target !== homeSearchInput && !e.target.closest('button')) {
              homeSearchInput.focus();
            }
          });
        }

        setTimeout(() => {
          if (activeTabId === tabId) {
            homeSearchInput.focus();
          }
        }, 100);
      }
      
      document.getElementById(`home-see-all-${tabId}`).addEventListener('click', (e) => {
        e.preventDefault();
        createTab('pens://notes');
      });

      if (window.electronAPI) {
        const topicInput = document.getElementById(`home-feed-topic-${tabId}`);
        const newsList = document.getElementById(`home-news-list-${tabId}`);
        const jobsList = document.getElementById(`home-jobs-list-${tabId}`);
        let savedSettings = await window.electronAPI.getSettings().catch(() => ({}));
        applyHomeBackground(tabId, savedSettings);
        topicInput.value = savedSettings.newsTopic || 'technology';
        const filterStatus = document.getElementById(`home-feed-filter-status-${tabId}`);
        const parseFeed = (xml) => {
          const doc = new DOMParser().parseFromString(xml, 'text/xml');
          return Array.from(doc.querySelectorAll('item')).slice(0, 6).map(item => ({
            title: item.querySelector('title')?.textContent?.trim() || 'Untitled',
            link: item.querySelector('link')?.textContent?.trim() || '',
            date: item.querySelector('pubDate')?.textContent?.trim() || ''
          })).filter(item => /^https?:\/\//i.test(item.link));
        };
        const renderFeed = (list, items) => {
          list.replaceChildren();
          if (!items.length) {
            const empty = document.createElement('p');
            empty.className = 'home-feed-empty';
            empty.textContent = 'No matching results.';
            list.appendChild(empty);
            return;
          }
          items.forEach(item => {
            const card = document.createElement('a');
            card.className = 'home-feed-item';
            card.href = item.link;
            card.target = '_blank';
            card.rel = 'noopener noreferrer';
            const title = document.createElement('strong');
            title.textContent = item.title;
            const date = document.createElement('small');
            date.textContent = item.date ? new Date(item.date).toLocaleDateString() : 'Latest';
            card.append(title, date);
            list.appendChild(card);
          });
        };
        const setFeedMessage = (list, message) => {
          list.replaceChildren();
          const empty = document.createElement('p');
          empty.className = 'home-feed-empty';
          empty.textContent = message;
          list.appendChild(empty);
        };
        const loadFeed = async (kind, target) => {
          const topic = topicInput.value.trim();
          if (!topic) {
            setFeedMessage(target, 'Enter a topic first.');
            return;
          }
          setFeedMessage(target, 'Loading...');
          try {
            const xml = await window.electronAPI.fetchHomeFeed(topic, kind);
            renderFeed(target, parseFeed(xml));
          } catch (error) {
            console.error('Unable to load home feed:', error);
            setFeedMessage(target, 'Feed unavailable. Check your connection and try again.');
          }
        };
        document.getElementById(`home-feed-save-${tabId}`).onclick = async () => {
          const topic = topicInput.value.trim();
          if (!topic) {
            filterStatus.textContent = 'Enter a topic before saving the filter.';
            topicInput.focus();
            return;
          }
          try {
            savedSettings = await window.electronAPI.saveSettings({ ...savedSettings, newsTopic: topic });
            filterStatus.textContent = `Saved filter: ${topic}`;
            await Promise.all([loadFeed('news', newsList), loadFeed('jobs', jobsList)]);
          } catch (error) {
            filterStatus.textContent = 'Unable to save this filter.';
            console.error('Unable to save home feed filter:', error);
          }
        };
        document.getElementById(`home-feed-news-${tabId}`).onclick = () => loadFeed('news', newsList);
        document.getElementById(`home-feed-jobs-${tabId}`).onclick = () => loadFeed('jobs', jobsList);
        document.getElementById(`home-feed-focus-${tabId}`).onclick = () => createTab('pens://focus');
        document.getElementById(`home-feed-refresh-${tabId}`).onclick = () => {
          loadFeed('news', newsList);
          loadFeed('jobs', jobsList);
        };
        loadFeed('news', newsList);
        loadFeed('jobs', jobsList);

        updateHomeGreeting(tabId).catch(error => console.error('Unable to update Home greeting:', error));
        
        if (window.electronAPI.getBookmarks) {
           window.electronAPI.getBookmarks().then(bookmarks => {
             const bookmarksList = document.getElementById(`home-bookmarks-${tabId}`);
             bookmarksList.innerHTML = '';
             bookmarks.slice(0, 8).forEach(b => {
               const div = document.createElement('div');
               div.className = 'home-bookmark-item';
               div.style.cssText = 'text-align: center; cursor: pointer; display: flex; flex-direction: column; align-items: center;';
               const icon = document.createElement('div');
               icon.style.cssText = 'width: 48px; height: 48px; background: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 8px; font-size: 20px; border: 1px solid #eee; color: #1a73e8;';
               icon.textContent = (b.title || b.url).charAt(0).toUpperCase();
               const text = document.createElement('div');
               text.style.cssText = 'font-size: 12px; color: #5f6368; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; width: 100%;';
               text.textContent = b.title || b.url;
               div.appendChild(icon);
               div.appendChild(text);
               div.onclick = () => createTab(b.url);
               bookmarksList.appendChild(div);
             });
           });
        }
        
        if (window.electronAPI.listNotes) {
          window.electronAPI.listNotes().then(notes => {
            const grid = document.getElementById(`notes-grid-${tabId}`);
            try {
              notes.sort((a, b) => b.updated - a.updated);
              
              if (notes.length > 0) {
                const latest = notes[0];
                const contSection = document.getElementById(`home-continue-${tabId}`);
                const contCard = document.getElementById(`continue-card-${tabId}`);
                contSection.style.display = 'block';
                
                let title = readableTitle(latest);
                let typeIcon = latest.type === 'pdf' ? '📄' : latest.type === 'blank' ? '📓' : '🌐';
                
                contCard.replaceChildren();
                const continueIcon = document.createElement('div');
                continueIcon.style.cssText = 'font-size: 24px; margin-right: 16px;';
                continueIcon.textContent = typeIcon;
                const continueInfo = document.createElement('div');
                continueInfo.style.cssText = 'flex: 1; overflow: hidden;';
                const continueTitle = document.createElement('div');
                continueTitle.style.cssText = 'font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #333;';
                continueTitle.textContent = title;
                const continueDate = document.createElement('div');
                continueDate.style.cssText = 'font-size: 12px; color: #666; margin-top: 4px;';
                continueDate.textContent = `Updated ${formatDate(latest.updated)}`;
                continueInfo.append(continueTitle, continueDate);
                contCard.append(continueIcon, continueInfo);
                contCard.onclick = () => {
                  if (latest.type === 'web') createTab(latest.source);
                  else if (latest.type === 'pdf') createPdfTab(latest.source);
                  else createTab('pens://notebook?id=' + encodeURIComponent(latest.id));
                };
              }
              
              grid.innerHTML = '';
              notes.slice(0, 4).forEach(note => {
                const card = document.createElement('div');
                card.style.cssText = 'background: white; border: 1px solid #e0e0e0; border-radius: 12px; overflow: hidden; cursor: pointer; transition: box-shadow 0.2s, transform 0.2s; display: flex; flex-direction: column;';
                card.onmouseover = () => { card.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'; card.style.transform = 'translateY(-2px)'; };
                card.onmouseout = () => { card.style.boxShadow = 'none'; card.style.transform = 'none'; };
                
                let title = readableTitle(note);
                
                const thumbContainer = document.createElement('div');
                thumbContainer.style.cssText = 'height: 120px; background: #f1f3f4; display: flex; align-items: center; justify-content: center; position: relative; border-bottom: 1px solid #eee;';
                if (note.thumbnail) {
                   const img = document.createElement('img');
                   img.src = note.thumbnail;
                   img.style.cssText = 'width: 100%; height: 100%; object-fit: cover;';
                   thumbContainer.appendChild(img);
                } else {
                   const typeIcon = note.type === 'pdf' ? '📄' : note.type === 'blank' ? '📓' : '🌐';
                   thumbContainer.innerHTML = `<span style="font-size: 40px; opacity: 0.5;">${typeIcon}</span>`;
                }
                
                const infoContainer = document.createElement('div');
                infoContainer.style.cssText = 'padding: 12px;';
                const noteTitle = document.createElement('div');
                noteTitle.style.cssText = 'font-weight: 500; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 4px; color: #333;';
                noteTitle.textContent = title;
                const noteMeta = document.createElement('div');
                noteMeta.style.cssText = 'font-size: 12px; color: #5f6368; display: flex; justify-content: space-between;';
                const noteDate = document.createElement('span');
                noteDate.textContent = formatDate(note.updated);
                const noteCount = document.createElement('span');
                noteCount.textContent = formatCount(note.strokeCount, 'stroke');
                noteMeta.append(noteDate, noteCount);
                infoContainer.append(noteTitle, noteMeta);
                
                card.appendChild(thumbContainer);
                card.appendChild(infoContainer);
                card.onclick = () => {
                  if (note.type === 'web') createTab(note.source);
                  else if (note.type === 'pdf') createPdfTab(note.source);
                  else createTab('pens://notebook?id=' + encodeURIComponent(note.id));
                };
                grid.appendChild(card);
              });
              if (notes.length === 0) grid.innerHTML = '<div style="color: #666;">No notes yet. Start exploring!</div>';
            } catch(e) { console.error(e); }
          });
        }
      }
    }, 0);
  } else if (url.startsWith('pens://notebook')) {
    const urlParams = new URLSearchParams(url.split('?')[1]);
    const notebookId = urlParams.get('id') || 'notebook_' + Date.now();
    tabObj.titleEl.textContent = 'Notebook';
    tabObj.saveEnabled = true;

    viewContainer.innerHTML = `
      <div style="display: flex; height: 100%; background: #e0e0e0; font-family: 'Segoe UI', sans-serif;">
        <div style="width: 200px; background: #f8f9fa; border-right: 1px solid #ccc; display: flex; flex-direction: column;">
          <div style="padding: 16px; border-bottom: 1px solid #ddd; text-align: center;">
            <button id="add-page-btn-${tabId}" style="width: 100%; padding: 8px; background: #1a73e8; color: white; border: none; border-radius: 4px; cursor: pointer;">+ Add Page</button>
          </div>
          <div id="page-strip-${tabId}" style="flex: 1; overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 10px;">
            <!-- Page thumbnails go here -->
          </div>
        </div>
        <div style="flex: 1; position: relative; overflow: auto; display: flex; justify-content: center; padding: 20px;">
          <div id="notebook-canvas-${tabId}" style="width: 800px; height: 1131px; background: white; box-shadow: 0 4px 12px rgba(0,0,0,0.1); position: relative;"></div>
        </div>
      </div>
    `;
    contentArea.appendChild(viewContainer);
    tabs.push(tabObj);

    setTimeout(() => {
      const canvasContainer = document.getElementById(`notebook-canvas-${tabId}`);
      if (window.InkEngine) {
        tabObj.pdfViewer = null; 
        tabObj.engine = new window.InkEngine(canvasContainer, notebookId);
        tabObj.engine.autoSave = async () => {
          await window.electronAPI.saveNotes(notebookId, { version: 1, source: { type: 'blank', id: notebookId, title: 'Notebook' }, strokes: tabObj.engine.strokes });
          if (tabObj.engine.thumbnailTimeout) clearTimeout(tabObj.engine.thumbnailTimeout);
          tabObj.engine.thumbnailTimeout = setTimeout(async () => {
            await window.electronAPI.saveNotes(notebookId, { version: 1, source: { type: 'blank', id: notebookId, title: 'Notebook' }, strokes: tabObj.engine.strokes, thumbnail: tabObj.engine.getThumbnail() });
          }, 2000);
        };
      }
      document.getElementById(`add-page-btn-${tabId}`).onclick = () => alert("Multi-page support in development!");
    }, 0);
  } else if (url === 'pens://focus') {
    tabObj.titleEl.textContent = 'Focus';
    viewContainer.innerHTML = `
      <div class="focus-page">
        <header class="focus-header">
          <div><h1>Focus</h1><p>Explore related headlines, jobs, and internships without leaving your workspace.</p></div>
          <button id="focus-refresh-${tabId}" class="home-feed-refresh">Refresh</button>
        </header>
        <div class="focus-controls">
          <label for="focus-topic-${tabId}">Topic</label>
          <input id="focus-topic-${tabId}" type="text" maxlength="120" placeholder="Technology, design, finance..." aria-label="Focus topic">
          <button id="focus-save-${tabId}" class="home-feed-save">Save filter</button>
          <span id="focus-status-${tabId}" role="status"></span>
        </div>
        <div class="focus-columns">
          <section><h2>News</h2><div id="focus-news-${tabId}" class="focus-list"><p class="home-feed-empty">Loading headlines...</p></div></section>
          <section><h2>Jobs & internships</h2><div id="focus-jobs-${tabId}" class="focus-list"><p class="home-feed-empty">Loading opportunities...</p></div></section>
        </div>
      </div>
    `;
    contentArea.appendChild(viewContainer);
    tabs.push(tabObj);
    setTimeout(async () => {
      const topicInput = document.getElementById(`focus-topic-${tabId}`);
      const newsList = document.getElementById(`focus-news-${tabId}`);
      const jobsList = document.getElementById(`focus-jobs-${tabId}`);
      const status = document.getElementById(`focus-status-${tabId}`);
      let settings = await window.electronAPI.getSettings().catch(() => ({}));
      topicInput.value = settings.newsTopic || 'technology';

      const renderMessage = (list, message) => {
        list.replaceChildren();
        const node = document.createElement('p');
        node.className = 'home-feed-empty';
        node.textContent = message;
        list.appendChild(node);
      };
      const renderItems = (list, xml) => {
        const doc = new DOMParser().parseFromString(xml, 'text/xml');
        const items = Array.from(doc.querySelectorAll('item')).slice(0, 20).map(item => ({
          title: item.querySelector('title')?.textContent?.trim() || 'Untitled',
          link: item.querySelector('link')?.textContent?.trim() || '',
          date: item.querySelector('pubDate')?.textContent?.trim() || ''
        })).filter(item => /^https?:\/\//i.test(item.link));
        list.replaceChildren();
        if (!items.length) {
          renderMessage(list, 'No matching results.');
          return;
        }
        items.forEach(item => {
          const link = document.createElement('a');
          link.className = 'focus-item';
          link.href = item.link;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          const title = document.createElement('strong');
          title.textContent = item.title;
          const date = document.createElement('small');
          date.textContent = item.date ? new Date(item.date).toLocaleDateString() : 'Latest';
          link.append(title, date);
          list.appendChild(link);
        });
      };
      const load = async (kind, list) => {
        const topic = topicInput.value.trim();
        if (!topic) {
          renderMessage(list, 'Enter a topic first.');
          return;
        }
        renderMessage(list, 'Loading...');
        try {
          renderItems(list, await window.electronAPI.fetchHomeFeed(topic, kind));
        } catch (error) {
          console.error(`Unable to load focused ${kind} feed:`, error);
          renderMessage(list, 'Feed unavailable. Check your connection and try again.');
        }
      };
      const loadAll = () => Promise.all([load('news', newsList), load('jobs', jobsList)]);
      document.getElementById(`focus-refresh-${tabId}`).onclick = loadAll;
      document.getElementById(`focus-save-${tabId}`).onclick = async () => {
        const topic = topicInput.value.trim();
        if (!topic) {
          status.textContent = 'Enter a topic before saving.';
          topicInput.focus();
          return;
        }
        try {
          settings = await window.electronAPI.saveSettings({ ...settings, newsTopic: topic });
          status.textContent = `Saved filter: ${topic}`;
          await loadAll();
        } catch (error) {
          status.textContent = 'Unable to save this filter.';
          console.error('Unable to save focused feed filter:', error);
        }
      };
      await loadAll();
    }, 0);
  } else if (url === 'pens://notes') {
    tabObj.titleEl.textContent = 'My Notes';
    viewContainer.innerHTML = `
      <div style="display: flex; flex-direction: column; height: 100%; background: #fafafa; font-family: 'Segoe UI', sans-serif;">
        <div style="padding: 24px 40px; border-bottom: 1px solid #e0e0e0; background: white; display: flex; align-items: center; justify-content: space-between;">
          <h1 style="margin: 0; font-size: 24px; color: #333;">My Notes</h1>
          <input type="text" id="notes-search-${tabId}" placeholder="Search notes..." style="padding: 10px 16px; border-radius: 20px; border: 1px solid #ccc; width: 300px; font-size: 14px;">
        </div>
        <div style="padding: 24px 40px; overflow-y: auto; flex: 1;">
          <div id="notes-list-${tabId}" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 24px;">
            Loading...
          </div>
        </div>
      </div>
    `;
    contentArea.appendChild(viewContainer);
    tabs.push(tabObj);

    setTimeout(() => {
      const searchInput = document.getElementById(`notes-search-${tabId}`);
      const listContainer = document.getElementById(`notes-list-${tabId}`);
      let allNotes = [];

      function renderNotes(filter = '') {
        listContainer.innerHTML = '';
        const filtered = allNotes.filter(n => (n.title || n.id).toLowerCase().includes(filter.toLowerCase()));
        
        filtered.forEach(note => {
          const card = document.createElement('div');
          card.style.cssText = 'background: white; border: 1px solid #ddd; border-radius: 12px; overflow: hidden; cursor: pointer; transition: transform 0.2s, box-shadow 0.2s; display: flex; flex-direction: column;';
          card.onmouseover = () => { card.style.transform = 'translateY(-4px)'; card.style.boxShadow = '0 6px 16px rgba(0,0,0,0.1)'; };
          card.onmouseout = () => { card.style.transform = 'none'; card.style.boxShadow = 'none'; };

          let title = readableTitle(note);
          
          const thumbContainer = document.createElement('div');
          thumbContainer.style.cssText = 'height: 140px; background: #f1f3f4; display: flex; align-items: center; justify-content: center; border-bottom: 1px solid #eee; position: relative;';
          if (note.thumbnail) {
            const img = document.createElement('img');
            img.src = note.thumbnail;
            img.style.cssText = 'width: 100%; height: 100%; object-fit: cover;';
            thumbContainer.appendChild(img);
          } else {
            const typeIcon = note.type === 'pdf' ? '📄' : note.type === 'blank' ? '📓' : '🌐';
            const placeholder = document.createElement('span');
            placeholder.style.cssText = 'font-size: 48px; opacity: 0.5;';
            placeholder.textContent = typeIcon;
            thumbContainer.appendChild(placeholder);
          }
          
          const info = document.createElement('div');
          info.style.cssText = 'padding: 16px; flex: 1; display: flex; flex-direction: column;';
          const cardTitle = document.createElement('div');
          cardTitle.style.cssText = 'font-weight: 500; font-size: 15px; margin-bottom: 8px; color: #202124; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;';
          cardTitle.textContent = title;
          const cardMeta = document.createElement('div');
          cardMeta.style.cssText = 'margin-top: auto; display: flex; justify-content: space-between; font-size: 12px; color: #5f6368;';
          const cardDate = document.createElement('span');
          cardDate.textContent = formatDate(note.updated);
          const cardCount = document.createElement('span');
          cardCount.textContent = formatCount(note.strokeCount, 'stroke');
          cardMeta.append(cardDate, cardCount);
          info.append(cardTitle, cardMeta);
          
          card.appendChild(thumbContainer);
          card.appendChild(info);
          card.onclick = () => {
            if (note.type === 'web') createTab(note.source);
            else if (note.type === 'pdf') createPdfTab(note.source);
            else createTab('pens://notebook?id=' + encodeURIComponent(note.id));
          };
          listContainer.appendChild(card);
        });
        
        if (filtered.length === 0) listContainer.innerHTML = '<div style="grid-column: 1 / -1; color: #666; text-align: center; padding: 40px;">No matching notes found.</div>';
      }

      if (window.electronAPI && window.electronAPI.listNotes) {
        window.electronAPI.listNotes().then(notes => {
          allNotes = notes.sort((a, b) => b.updated - a.updated);
          renderNotes();
        });
      }

      searchInput.addEventListener('input', (e) => {
        renderNotes(e.target.value);
      });
    }, 0);
  } else if (url === 'pens://history') {
    tabObj.titleEl.textContent = 'History';
    viewContainer.innerHTML = `
      <div class="settings-page" style="padding: 40px; font-family: sans-serif; height: 100%; overflow-y: auto;">
        <h2>Browsing History</h2>
        <button id="btn-clear-history-${tabId}" style="margin-bottom: 20px; padding: 8px; background: #ea4335; color: white; border-radius: 4px;">Clear History</button>
        <div id="history-list-${tabId}">Loading...</div>
      </div>
    `;
    contentArea.appendChild(viewContainer);
    tabs.push(tabObj);
    setTimeout(async () => {
      const historyList = document.getElementById(`history-list-${tabId}`);
      document.getElementById(`btn-clear-history-${tabId}`).onclick = async () => {
        if(confirm("Clear all history for this profile?")) {
          await window.electronAPI.clearHistory();
          historyList.innerHTML = 'History cleared.';
        }
      };

      if (window.electronAPI && window.electronAPI.getHistory) {
        const history = await window.electronAPI.getHistory();
        historyList.innerHTML = '';
        history.forEach(h => {
          const div = document.createElement('div');
          div.style.cssText = 'padding: 8px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center;';
          
          const contentDiv = document.createElement('div');
          
          const titleDiv = document.createElement('div');
          titleDiv.style.fontWeight = '500';
          titleDiv.textContent = h.title || h.url;
          
          const metaDiv = document.createElement('div');
          metaDiv.style.fontSize = '12px';
          metaDiv.style.color = '#666';
          metaDiv.textContent = `${h.url} - ${new Date(h.timestamp).toLocaleString()}`;
          
          contentDiv.appendChild(titleDiv);
          contentDiv.appendChild(metaDiv);
          div.appendChild(contentDiv);
          
          div.style.cursor = 'pointer';
          div.onclick = () => createTab(h.url);
          historyList.appendChild(div);
        });
        if (history.length === 0) historyList.innerHTML = 'No history yet.';
      }
    }, 0);
  } else if (url === 'pens://downloads') {
    tabObj.titleEl.textContent = 'Downloads';
    viewContainer.innerHTML = `
      <div class="settings-page" style="padding: 40px; font-family: sans-serif; height: 100%; overflow-y: auto;">
        <h2>Downloads</h2>
        <div id="downloads-list-${tabId}">Loading...</div>
      </div>
    `;
    contentArea.appendChild(viewContainer);
    tabs.push(tabObj);
    setTimeout(async () => {
      const list = document.getElementById(`downloads-list-${tabId}`);
      if (window.electronAPI && window.electronAPI.getDownloads) {
        const dls = await window.electronAPI.getDownloads();
        list.innerHTML = '';
        dls.forEach(d => {
          const div = document.createElement('div');
          div.style.cssText = 'padding: 12px; border-bottom: 1px solid #eee;';
          
          const nameDiv = document.createElement('div');
          nameDiv.style.fontWeight = 'bold';
          nameDiv.textContent = d.filename;
          
          const urlDiv = document.createElement('div');
          urlDiv.style.cssText = 'font-size: 12px; color: #666;';
          urlDiv.textContent = d.url;
          
          const stateDiv = document.createElement('div');
          stateDiv.style.fontSize = '12px';
          stateDiv.style.color = d.state === 'completed' ? 'green' : 'orange';
          stateDiv.textContent = `${d.state} - ${(d.received/1024/1024).toFixed(2)} MB`;
          
          div.appendChild(nameDiv);
          div.appendChild(urlDiv);
          div.appendChild(stateDiv);
          list.appendChild(div);
        });
        if (dls.length === 0) list.innerHTML = 'No downloads yet.';
      }
    }, 0);
  } else if (url === 'pens://settings') {
    tabObj.titleEl.textContent = 'Settings';
    viewContainer.innerHTML = `
      <div class="settings-page">
        <div class="settings-shell">
          <header class="settings-heading">
            <div><h1>Settings</h1><p>Manage कलम for this profile.</p></div>
            <span class="settings-profile-badge">Active profile</span>
          </header>
          <div class="settings-layout">
            <nav class="settings-nav" aria-label="Settings sections">
              <a href="#appearance">Appearance</a><a href="#privacy">Privacy</a><a href="#lock">Lock</a><a href="#data">Data & backup</a><a href="#passwords">Passwords</a><a href="#about">About कलम</a>
            </nav>
            <main class="settings-content">
              <section class="settings-card" id="appearance"><h2>Appearance</h2><p class="settings-help">Choose how कलम looks across this profile.</p>
                <label for="setting-theme-${tabId}">Theme</label>
                <select id="setting-theme-${tabId}"><option value="system">Use system setting</option><option value="light">Light</option><option value="dark">Dark</option></select>
                <label class="settings-toggle"><input type="checkbox" id="setting-performance-${tabId}"><span><strong>Performance mode</strong><small>Uses lower PDF render quality and fewer visual effects for smoother scrolling.</small></span></label>
                <div class="settings-actions"><button id="btn-home-background-${tabId}" class="settings-secondary">Choose Home background</button><button id="btn-clear-home-background-${tabId}" class="settings-secondary">Remove background</button></div>
                <p id="home-background-status-${tabId}" class="settings-help" role="status">No custom Home background selected.</p>
              </section>
              <section class="settings-card" id="privacy"><h2>Privacy and Shields</h2><p class="settings-help">Block known trackers and clear browsing data for this profile.</p>
                <label class="settings-toggle"><input type="checkbox" id="setting-shields-${tabId}"><span><strong>Enable Shields</strong><small>Blocks known trackers where supported.</small></span></label>
                <div class="settings-actions"><button id="btn-clear-data-${tabId}" class="settings-danger">Clear cache and cookies</button></div>
              </section>
              <section class="settings-card" id="lock"><h2>Automatic locking</h2><p class="settings-help">Choose how you will unlock कलम after it locks. You can use a PIN or password now. Windows Hello fingerprint support is not available yet.</p>
                <div class="lock-settings-form">
                  <label for="lock-type-${tabId}">Unlock method</label>
                  <select id="lock-type-${tabId}" aria-label="Lock credential type"><option value="pin">PIN (6+ digits)</option><option value="password">Password (8+ characters)</option></select>
                  <input id="lock-secret-${tabId}" type="password" placeholder="Enter a new PIN or password" autocomplete="new-password">
                  <input id="lock-current-${tabId}" type="password" placeholder="Current PIN or password (only when changing/removing)" autocomplete="current-password">
                  <div class="lock-settings-actions"><button id="btn-set-lock-${tabId}" class="settings-primary-button">Set or change unlock method</button><button id="btn-remove-lock-${tabId}" class="settings-secondary">Remove lock</button></div>
                  <p id="lock-status-${tabId}" class="settings-help" role="status">Checking lock status...</p>
                  <p id="lock-settings-status-${tabId}" class="settings-help" role="status"></p>
                </div>
                <label for="setting-lock-idle-${tabId}">Lock after inactivity</label>
                <select id="setting-lock-idle-${tabId}">
                  <option value="0">Never</option><option value="1">1 minute</option><option value="5">5 minutes</option><option value="10">10 minutes</option><option value="30">30 minutes</option><option value="60">1 hour</option>
                </select>
                <label class="settings-toggle"><input type="checkbox" id="setting-lock-minimize-${tabId}"><span><strong>Lock when minimized</strong><small>Locks after this profile window is minimized.</small></span></label>
                <label class="settings-toggle"><input type="checkbox" id="setting-lock-system-${tabId}"><span><strong>Lock on Windows lock or sleep</strong><small>Locks when Windows is locked or the device enters sleep.</small></span></label>
                <label class="settings-toggle"><input type="checkbox" id="setting-lock-startup-${tabId}"><span><strong>Lock when कलम starts</strong><small>Locks this profile at the next app start.</small></span></label>
              </section>
              <section class="settings-card" id="data"><h2>Data and backup</h2><p class="settings-help">Export a portable copy of this profile. Keep backups in a trusted location.</p>
                <div class="settings-actions"><button id="btn-export-profile-${tabId}" class="settings-secondary">Export profile (.penprofile)</button></div>
              </section>
              <section class="settings-card" id="passwords"><h2>Passwords and autofill</h2><p class="settings-help">Saved passwords are stored encrypted. Reauthenticate before viewing this list.</p>
                <div class="settings-actions"><button id="btn-load-passwords-${tabId}" class="settings-secondary">Unlock password list</button></div>
                <div id="passwords-list-${tabId}" class="passwords-list">Password list is locked.</div>
                <div class="password-form"><input type="url" id="add-pass-url-${tabId}" placeholder="https://example.com" aria-label="Site URL"><input type="text" id="add-pass-user-${tabId}" placeholder="Username" aria-label="Username"><input type="password" id="add-pass-pass-${tabId}" placeholder="Password" aria-label="Password"><button id="btn-add-pass-${tabId}" class="settings-primary-button">Add password</button></div>
              </section>
              <section class="settings-card" id="about"><h2>About कलम</h2><p class="settings-help">A focused workspace for browsing, reading, writing, and organizing your ideas.</p>
                <div class="about-feature-grid">
                  <div class="about-feature"><strong>Browse and research</strong><span>Open web pages in a calm, focused browser with profiles, bookmarks, history, and privacy controls.</span></div>
                  <div class="about-feature"><strong>Read and mark up PDFs</strong><span>Open PDFs, zoom in, add text comments, draw with pen or highlighter, and export your work.</span></div>
                  <div class="about-feature"><strong>Write with ink</strong><span>Use the floating ink palette with custom colors, stroke size, opacity, eraser, undo, and redo.</span></div>
                  <div class="about-feature"><strong>Keep work organized</strong><span>Save notes per profile, personalize your workspace, and keep important data in one place.</span></div>
                  <div class="about-feature"><strong>Stay protected</strong><span>Use profile locking, automatic lock triggers, encrypted password storage, and one-time recovery keys.</span></div>
                  <div class="about-feature"><strong>Stay informed</strong><span>Follow topic-based news, jobs, and internship feeds directly from your home workspace.</span></div>
                </div>
              </section>
            </main>
          </div>
          <div class="settings-footer"><button id="btn-save-settings-${tabId}" class="settings-primary-button">Save settings</button><span id="settings-save-status-${tabId}" role="status"></span></div>
        </div>
      </div>
    `;
    contentArea.appendChild(viewContainer);
    tabs.push(tabObj);
    const settingsPage = viewContainer.querySelector('.settings-page');
    const settingsContent = settingsPage?.querySelector('.settings-content');
    if (settingsContent) addIdentitySettings(tabId, settingsContent).catch(error => console.error('Unable to load identity settings:', error));

    setTimeout(async () => {
      if (window.electronAPI && window.electronAPI.getSettings) {
        let settings = await window.electronAPI.getSettings();
        document.getElementById(`setting-theme-${tabId}`).value = settings.theme || 'system';
        document.getElementById(`setting-performance-${tabId}`).checked = settings.performanceMode === true;
        const homeBackgroundStatus = document.getElementById(`home-background-status-${tabId}`);
        if (settings.homeBackgroundImage) homeBackgroundStatus.textContent = 'Custom Home background selected.';
        document.getElementById(`btn-home-background-${tabId}`).onclick = async () => {
          try {
            const image = await window.electronAPI.openHomeBackground();
            if (!image) return;
            const updatedSettings = { ...settings, homeBackgroundImage: image };
            await window.electronAPI.saveSettings(updatedSettings);
            settings = updatedSettings;
            applyHomeBackground(tabId, updatedSettings);
            homeBackgroundStatus.textContent = 'Custom Home background selected.';
          } catch (error) {
            homeBackgroundStatus.textContent = error.message || 'Unable to select background.';
          }
        };
        document.getElementById(`btn-clear-home-background-${tabId}`).onclick = async () => {
          const updatedSettings = { ...settings, homeBackgroundImage: '' };
          await window.electronAPI.saveSettings(updatedSettings);
          settings = updatedSettings;
          applyHomeBackground(tabId, updatedSettings);
          homeBackgroundStatus.textContent = 'No custom Home background selected.';
        };
        document.getElementById(`setting-shields-${tabId}`).checked = settings.shieldsEnabled !== false;
        document.getElementById(`setting-lock-idle-${tabId}`).value = String(settings.lockIdleMinutes || 0);
        document.getElementById(`setting-lock-minimize-${tabId}`).checked = settings.lockOnMinimize === true;
        document.getElementById(`setting-lock-system-${tabId}`).checked = settings.lockOnSystemLock === true;
        document.getElementById(`setting-lock-startup-${tabId}`).checked = settings.lockOnStartup === true;

        document.getElementById(`btn-save-settings-${tabId}`).onclick = async () => {
          const saveButton = document.getElementById(`btn-save-settings-${tabId}`);
          const saveStatus = document.getElementById(`settings-save-status-${tabId}`);
          const newSettings = {
            theme: document.getElementById(`setting-theme-${tabId}`).value,
            performanceMode: document.getElementById(`setting-performance-${tabId}`).checked,
            homeBackgroundImage: settings.homeBackgroundImage || '',
            shieldsEnabled: document.getElementById(`setting-shields-${tabId}`).checked,
            lockIdleMinutes: Number(document.getElementById(`setting-lock-idle-${tabId}`).value),
            lockOnMinimize: document.getElementById(`setting-lock-minimize-${tabId}`).checked,
            lockOnSystemLock: document.getElementById(`setting-lock-system-${tabId}`).checked,
            lockOnStartup: document.getElementById(`setting-lock-startup-${tabId}`).checked
          };
          saveButton.disabled = true;
          saveStatus.textContent = 'Saving...';
          try {
            settings = await window.electronAPI.saveSettings(newSettings);
            applyTheme(settings.theme);
            saveStatus.textContent = 'Settings saved.';
          } catch (error) {
            saveStatus.textContent = error.message || 'Unable to save settings.';
          } finally {
            saveButton.disabled = false;
          }
        };

        const lockStatus = document.getElementById(`lock-status-${tabId}`);
        const lockMessage = document.getElementById(`lock-settings-status-${tabId}`);
        const refreshLockStatus = async () => {
          const state = await window.electronAPI.getLockState();
          lockStatus.textContent = state.credentialConfigured ? 'Enabled' : 'Not configured';
          return state;
        };
        await refreshLockStatus();
        document.getElementById(`btn-set-lock-${tabId}`).onclick = async () => {
          const type = document.getElementById(`lock-type-${tabId}`).value;
          const secret = document.getElementById(`lock-secret-${tabId}`).value;
          const current = document.getElementById(`lock-current-${tabId}`).value || null;
          try {
            const currentState = await window.electronAPI.getLockState();
            if (currentState.credentialConfigured) await window.electronAPI.reauthenticate(current);
            const result = await window.electronAPI.setLockCredential(type, secret, current);
            lockMessage.textContent = result.recoveryKey
              ? `Lock enabled. Save this one-time recovery key now: ${result.recoveryKey}`
              : 'Lock credential updated.';
            document.getElementById(`lock-secret-${tabId}`).value = '';
            document.getElementById(`lock-current-${tabId}`).value = '';
            await refreshLockStatus();
          } catch (error) {
            lockMessage.textContent = error.message || 'Unable to update the lock.';
          }
        };
        document.getElementById(`btn-remove-lock-${tabId}`).onclick = async () => {
          const current = document.getElementById(`lock-current-${tabId}`).value;
          if (!current || !confirm('Remove the profile lock?')) return;
          try {
            await window.electronAPI.reauthenticate(current);
            await window.electronAPI.removeLockCredential(current);
            lockMessage.textContent = 'Profile lock removed.';
            document.getElementById(`lock-current-${tabId}`).value = '';
            await refreshLockStatus();
          } catch (error) {
            lockMessage.textContent = error.message || 'Unable to remove the lock.';
          }
        };
      }
      
      if (window.electronAPI && window.electronAPI.clearBrowsingData) {
        document.getElementById(`btn-clear-data-${tabId}`).onclick = async () => {
          if(confirm("Clear all cache, cookies, and storage for this profile?")) {
            await window.electronAPI.clearBrowsingData();
            alert('Data cleared successfully.');
          }
        };
        
        document.getElementById(`btn-export-profile-${tabId}`).onclick = async () => {
          const success = await window.electronAPI.exportProfile();
          if (success) alert('Profile exported successfully!');
        };
      }
      
      const renderPasswords = async () => {
        if (window.electronAPI && window.electronAPI.getPasswords) {
           const list = document.getElementById(`passwords-list-${tabId}`);
           try {
             const passes = await window.electronAPI.getPasswords();
             list.innerHTML = '';
             passes.forEach(p => {
              const div = document.createElement('div');
              div.style.cssText = 'padding: 8px; border-bottom: 1px solid #eee; display: flex; gap: 20px;';
              
              const urlDiv = document.createElement('div');
              const strong = document.createElement('strong');
              strong.textContent = p.url;
              urlDiv.appendChild(strong);
              
              const userDiv = document.createElement('div');
              userDiv.textContent = p.username;
              
              const passDiv = document.createElement('div');
              passDiv.textContent = '*'.repeat(p.password.length);
              
              div.appendChild(urlDiv);
              div.appendChild(userDiv);
              div.appendChild(passDiv);
              
                list.appendChild(div);
             });
             if (passes.length === 0) list.textContent = 'No passwords saved yet.';
           } catch (error) {
             list.textContent = error.message || 'Unable to load saved passwords.';
             throw error;
           }
        }
      };
      document.getElementById(`btn-load-passwords-${tabId}`).onclick = async () => {
        const credential = window.prompt('Enter your current PIN or password to view saved passwords.');
        if (!credential) return;
        const list = document.getElementById(`passwords-list-${tabId}`);
        try {
          await window.electronAPI.reauthenticate(credential);
          await renderPasswords();
        } catch (error) {
          list.textContent = error.message || 'Unable to unlock the password list.';
        }
      };
      
      document.getElementById(`btn-add-pass-${tabId}`).onclick = async () => {
        const url = document.getElementById(`add-pass-url-${tabId}`).value;
        const user = document.getElementById(`add-pass-user-${tabId}`).value;
        const pass = document.getElementById(`add-pass-pass-${tabId}`).value;
        if (url && user && pass) {
          await window.electronAPI.addPassword(url, user, pass);
          renderPasswords().catch(() => {});
        }
      };

    }, 0);
  } else {
    setupWebview(tabObj, url);
  }

  activateTab(tabId);
}

function setupWebview(tabObj, url) {
  tabObj.viewEl.innerHTML = '';
  const webview = document.createElement('webview');
  webview.setAttribute('preload', webviewPreloadPath);
  webview.setAttribute('src', url);
  
  tabObj.viewEl.appendChild(webview);
  if (!tabObj.viewEl.parentNode) contentArea.appendChild(tabObj.viewEl);
  
  tabObj.webview = webview;
  if (!tabs.includes(tabObj)) tabs.push(tabObj);

  webview.addEventListener('wheel', (event) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    event.stopPropagation();
    if (activeTabId === tabObj.id) {
      applyZoom(event.deltaY < 0 ? 0.1 : -0.1);
    }
  }, { passive: false });
  
  webview.addEventListener('did-start-loading', () => { tabObj.titleEl.textContent = 'Loading...'; });
  
  webview.addEventListener('did-fail-load', (e) => {
    if (e.errorCode !== 0 && (e.errorDescription.includes('CERT') || e.errorCode <= -200)) {
      webview.executeJavaScript(`document.body.innerHTML = "<div style='padding:40px;font-family:sans-serif;text-align:center'><h2>Certificate Error</h2><p>" + ${JSON.stringify(e.errorDescription)} + "</p><button onclick='history.back()'>Go Back</button></div>";`);
    }
  });

  webview.addEventListener('did-stop-loading', async () => {
    tabObj.titleEl.textContent = webview.getTitle();
    tabObj.url = webview.getURL();
    if (activeTabId === tabObj.id) {
      addressBar.value = tabObj.url;
    }
    
    recordHistory(tabObj.url, tabObj.titleEl.textContent);
    
    const urlId = tabObj.url.split('?')[0].split('#')[0];
    const data = await window.electronAPI.loadNotes(urlId);
    if (data && data.strokes && data.strokes.length > 0) {
      // Previously kept notes exist for this website: reload them and keep recording ON
      tabObj.saveEnabled = true;
      tabObj.currentStrokes = data.strokes;
      tabObj.currentThumbnail = data.thumbnail || '';
      if (webview.send) webview.send('load-strokes', data);
    } else {
      // By default, recording of sketches on websites is OFF unless explicitly turned on
      tabObj.saveEnabled = false;
      tabObj.currentStrokes = [];
      tabObj.currentThumbnail = '';
    }
    
    if (activeTabId === tabObj.id) {
      updateSaveToggleUI(tabObj);
    }
    
    if (webview.send) {
      webview.send('set-mode', window.effectiveMode);
      webview.send('set-eraser', window.isEraser);
      broadcastStyle();
    }
  });

  webview.addEventListener('ipc-message', (e) => {
    if (e.channel === 'save-strokes') {
      const { strokes, thumbnail } = e.args[0] || {};
      const payloadStrokes = strokes || e.args[0];
      tabObj.currentStrokes = payloadStrokes;
      if (thumbnail) tabObj.currentThumbnail = thumbnail;
      
      if (!tabObj.saveEnabled) return;
      
      const data = { version: 1, source: { type: 'web', url: tabObj.url }, strokes: payloadStrokes, thumbnail: tabObj.currentThumbnail };
      const urlId = tabObj.url.split('?')[0].split('#')[0];
      window.electronAPI.saveNotes(urlId, data);
    } else if (e.channel === 'pointer-activity') {
      window.handlePointerActivity(e.args[0]);
      reportActivity(true, 1800);
    } else if (e.channel === 'pointer-leave') {
      window.handlePointerLeave(e.args[0]);
      reportActivity(false);
    } else if (e.channel === 'personal-details-request') {
      const request = e.args[0] || {};
      let requestUrl;
      try {
        requestUrl = new URL(request.origin || '');
      } catch {
        return;
      }
      if (tabObj !== getActiveTab() || !tabObj.webview || !/^https?:$/.test(requestUrl.protocol)) return;
      window.electronAPI.getPersonalDetails(request.origin).then(result => {
        if (!result?.details) return;
        const fields = {
          name: 'name',
          email: 'email',
          phone: 'phone',
          address: 'address'
        };
        const fieldName = String(request.field || '').toLowerCase();
        const selected = fields.email && /email/.test(fieldName) ? 'email'
          : /phone|tel/.test(fieldName) ? 'phone'
            : /address|street|city|postal|zip|country/.test(fieldName) ? 'address'
              : 'name';
        if (confirm(`Use your saved ${selected} on this site?`)) {
          tabObj.webview.send('fill-personal-details', result.details);
        }
      }).catch(error => console.warn('Autofill unavailable:', error.message));
    }
  });
}

function activateTab(tabId) {
  activeTabId = tabId;
  tabs.forEach(tab => {
    if (tab.id === tabId) {
      tab.el.classList.add('active');
      tab.viewEl.classList.add('active');
      if (tab.webview) tab.webview.style.pointerEvents = 'auto';
      if (tab.url === 'pens://home') {
        addressBar.value = '';
      } else {
        addressBar.value = (tab.webview && tab.webview.getURL) ? (tab.webview.getURL() || tab.url) : tab.url;
      }
      if (tab.pdfViewer) {
        tab.pdfViewer.setActive(true);
        tab.pdfViewer.setMode(window.effectiveMode);
        tab.pdfViewer.setEraser(window.isEraser);
      }
      updateSaveToggleUI(tab);
    } else {
      tab.el.classList.remove('active');
      tab.viewEl.classList.remove('active');
      if (tab.webview) tab.webview.style.pointerEvents = 'none';
      if (tab.pdfViewer) tab.pdfViewer.setActive(false);
    }
  });
  const isPdf = Boolean(getActiveTab() && getActiveTab().pdfViewer);
  btnPdfText.classList.toggle('active', isPdf);
  btnPdfSave.classList.toggle('active', isPdf);
  broadcastStyle();
}

async function closeTab(tabId) {
  const index = tabs.findIndex(t => t.id === tabId);
  if (index === -1) return;
  const tab = tabs[index];
  
  const action = await promptUnsavedSketch(tab);
  if (action === 'cancel') return;

  if (tab.url && !tab.url.startsWith('pens://')) closedTabs.push(tab.url);
  if (closedTabs.length > 20) closedTabs.shift();

  tab.el.remove();
  tab.viewEl.remove();
  tabs.splice(index, 1);
  if (tabs.length === 0) createTab();
  else if (activeTabId === tabId) activateTab(tabs[Math.max(0, index - 1)].id);
}

// Navigation
async function navigateTo(input) {
  const tab = getActiveTab();
  if (!tab) return;
  const url = resolveSearchOrUrl(input);
  if (!url) return;
  
  if (tab.url !== url && !tab.isPdf && !tab.url.startsWith('pens://')) {
    const action = await promptUnsavedSketch(tab);
    if (action === 'cancel') return;
  }
  
  if (url.startsWith('http://') && !url.startsWith('http://localhost') && !url.startsWith('http://127.0.0.1')) {
    if (!confirm('Warning: This site uses unencrypted HTTP which is insecure. Do you still want to proceed?')) {
      return;
    }
  }
  
  addressBar.value = url;
  
  if (tab.url.startsWith('pens://') || tab.pdfViewer) {
    tab.pdfViewer = null;
    tab.url = url;
    setupWebview(tab, url);
  } else if (tab.webview) {
    tab.url = url;
    tab.webview.setAttribute('src', url);
  } else {
    tab.url = url;
    setupWebview(tab, url);
  }
}

async function reloadActiveTab(opts = {}) {
  const tab = getActiveTab();
  if (!tab) return;

  if (tab.webview) {
    try {
      if (opts.ignoreCache && tab.webview.reloadIgnoringCache) {
        tab.webview.reloadIgnoringCache();
      } else {
        tab.webview.reload();
      }
    } catch (err) {
      console.error('Error reloading webview:', err);
    }
    return;
  }

  if (tab.isPdf && tab.pdfViewer) {
    try {
      await tab.pdfViewer.loadPDF();
    } catch (err) {
      console.error('Error reloading PDF:', err);
    }
    return;
  }

  if (tab.url) {
    const tabId = tab.id;
    if (tab.url === 'pens://home') {
      if (window.electronAPI) {
        updateHomeGreeting(tabId).catch(error => console.error('Unable to update Home greeting:', error));
        if (window.electronAPI.getBookmarks) {
          window.electronAPI.getBookmarks().then(bookmarks => {
            const bookmarksList = document.getElementById(`home-bookmarks-${tabId}`);
            if (!bookmarksList) return;
            bookmarksList.innerHTML = '';
            bookmarks.slice(0, 8).forEach(b => {
              const div = document.createElement('div');
              div.style.cssText = 'text-align: center; cursor: pointer; display: flex; flex-direction: column; align-items: center;';
              const icon = document.createElement('div');
              icon.style.cssText = 'width: 48px; height: 48px; background: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 8px; font-size: 20px; border: 1px solid #eee; color: #1a73e8;';
              icon.textContent = (b.title || b.url).charAt(0).toUpperCase();
              const text = document.createElement('div');
              text.style.cssText = 'font-size: 12px; color: #5f6368; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; width: 100%;';
              text.textContent = b.title || b.url;
              div.appendChild(icon);
              div.appendChild(text);
              div.onclick = () => createTab(b.url);
              bookmarksList.appendChild(div);
            });
          });
        }
        if (window.electronAPI.listNotes) {
          window.electronAPI.listNotes().then(notes => {
            const grid = document.getElementById(`notes-grid-${tabId}`);
            if (!grid) return;
            notes.sort((a, b) => b.updated - a.updated);
            if (notes.length > 0) {
              const latest = notes[0];
              const contSection = document.getElementById(`home-continue-${tabId}`);
              const contCard = document.getElementById(`continue-card-${tabId}`);
              if (contSection && contCard) {
                contSection.style.display = 'block';
                let title = latest.title || latest.id;
                let typeIcon = latest.type === 'pdf' ? '📄' : latest.type === 'blank' ? '📓' : '🌐';
                contCard.innerHTML = `<div style="font-size: 24px; margin-right: 16px;">${typeIcon}</div>
                                      <div style="flex: 1; overflow: hidden;">
                                        <div style="font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #333;">${title}</div>
                                        <div style="font-size: 12px; color: #666; margin-top: 4px;">Updated ${new Date(latest.updated).toLocaleDateString()}</div>
                                      </div>`;
                contCard.onclick = () => {
                  if (latest.type === 'web') createTab(latest.source);
                  else if (latest.type === 'pdf') createPdfTab(latest.source);
                  else createTab('pens://notebook?id=' + encodeURIComponent(latest.id));
                };
              }
            }
            grid.innerHTML = '';
            notes.slice(0, 4).forEach(note => {
              const card = document.createElement('div');
              card.style.cssText = 'background: white; border: 1px solid #e0e0e0; border-radius: 12px; overflow: hidden; cursor: pointer; transition: box-shadow 0.2s, transform 0.2s; display: flex; flex-direction: column;';
              card.onmouseover = () => { card.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'; card.style.transform = 'translateY(-2px)'; };
              card.onmouseout = () => { card.style.boxShadow = 'none'; card.style.transform = 'none'; };
              let title = note.title || note.id;
              const thumbContainer = document.createElement('div');
              thumbContainer.style.cssText = 'height: 120px; background: #f1f3f4; display: flex; align-items: center; justify-content: center; position: relative; border-bottom: 1px solid #eee;';
              if (note.thumbnail) {
                 const img = document.createElement('img');
                 img.src = note.thumbnail;
                 img.style.cssText = 'width: 100%; height: 100%; object-fit: cover;';
                 thumbContainer.appendChild(img);
              } else {
                 const typeIcon = note.type === 'pdf' ? '📄' : note.type === 'blank' ? '📓' : '🌐';
                 thumbContainer.innerHTML = `<span style="font-size: 40px; opacity: 0.5;">${typeIcon}</span>`;
              }
              const infoContainer = document.createElement('div');
              infoContainer.style.cssText = 'padding: 12px;';
              infoContainer.innerHTML = `
                <div style="font-weight: 500; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 4px; color: #333;">${title}</div>
                <div style="font-size: 12px; color: #5f6368; display: flex; justify-content: space-between;">
                   <span>${new Date(note.updated).toLocaleDateString()}</span>
                   <span>${note.strokeCount} strokes</span>
                </div>
              `;
              card.appendChild(thumbContainer);
              card.appendChild(infoContainer);
              card.onclick = () => {
                if (note.type === 'web') createTab(note.source);
                else if (note.type === 'pdf') createPdfTab(note.source);
                else createTab('pens://notebook?id=' + encodeURIComponent(note.id));
              };
              grid.appendChild(card);
            });
            if (notes.length === 0) grid.innerHTML = '<div style="color: #666;">No notes yet. Start exploring!</div>';
          });
        }
      }
    } else if (tab.url.startsWith('pens://notebook')) {
      if (tab.engine) tab.engine.load();
    } else if (tab.url === 'pens://notes') {
      const searchInput = document.getElementById(`notes-search-${tabId}`);
      if (searchInput) searchInput.dispatchEvent(new Event('input'));
    } else if (tab.url === 'pens://history') {
      if (window.electronAPI && window.electronAPI.getHistory) {
        const history = await window.electronAPI.getHistory();
        const historyList = document.getElementById(`history-list-${tabId}`);
        if (historyList) {
          historyList.innerHTML = '';
          history.forEach(h => {
            const div = document.createElement('div');
            div.style.cssText = 'padding: 8px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; cursor: pointer;';
            div.innerHTML = `<div><div style="font-weight: 500;">${h.title || h.url}</div><div style="font-size: 12px; color: #666;">${h.url} - ${new Date(h.timestamp).toLocaleString()}</div></div>`;
            div.onclick = () => createTab(h.url);
            historyList.appendChild(div);
          });
          if (history.length === 0) historyList.innerHTML = 'No history yet.';
        }
      }
    } else if (tab.url === 'pens://downloads') {
      if (window.electronAPI && window.electronAPI.getDownloads) {
        const dls = await window.electronAPI.getDownloads();
        const list = document.getElementById(`downloads-list-${tabId}`);
        if (list) {
          list.innerHTML = '';
          dls.forEach(d => {
            const div = document.createElement('div');
            div.style.cssText = 'padding: 8px; border-bottom: 1px solid #eee;';
            div.innerHTML = `<strong>${d.filename}</strong> - ${d.state} (${(d.receivedBytes / 1024 / 1024).toFixed(2)} MB)`;
            list.appendChild(div);
          });
          if (dls.length === 0) list.innerHTML = 'No downloads yet.';
        }
      }
    }
  }
}

btnBack.addEventListener('click', () => { const tab = getActiveTab(); if (tab && tab.webview && tab.webview.canGoBack()) tab.webview.goBack(); });
btnForward.addEventListener('click', () => { const tab = getActiveTab(); if (tab && tab.webview && tab.webview.canGoForward()) tab.webview.goForward(); });
btnReload.addEventListener('click', () => reloadActiveTab());
newTabBtn.addEventListener('click', () => createTab());
addressBar.addEventListener('keydown', (e) => { if (e.key === 'Enter') navigateTo(addressBar.value); });

if (window.electronAPI && window.electronAPI.onReloadActiveTab) {
  window.electronAPI.onReloadActiveTab((opts) => reloadActiveTab(opts));
}

if (window.electronAPI && window.electronAPI.onProfileLocked) {
  window.electronAPI.onProfileLocked(() => {
    tabs.forEach(tab => tab.pdfViewer?.suspend());
  });
}
if (window.electronAPI && window.electronAPI.onProfileUnlocked) {
  window.electronAPI.onProfileUnlocked(() => {
    tabs.forEach(tab => tab.pdfViewer?.setActive(tab.id === activeTabId));
  });
}



// --- Floating Palette & Side Dock Logic ---
let currentColor = '#1a73e8';
let currentSize = 2.5;
let currentOpacity = 1;

const paletteDock = document.getElementById('palette-dock');
const fpToggleBtn = document.getElementById('fp-toggle-btn');
const fp = document.getElementById('floating-palette');
const fpBtnPin = document.getElementById('fp-btn-pin');
const fpBtnMinimize = document.getElementById('fp-btn-minimize');
const fpColorBadge = document.getElementById('fp-color-badge');
const fpSizeVal = document.getElementById('fp-size-val');
const swatches = document.querySelectorAll('.color-swatch');
const fpSize = document.getElementById('fp-size');
const fpOpacity = document.getElementById('fp-opacity');
const fpOpacityVal = document.getElementById('fp-opacity-val');

let isPalettePinned = false;
let isPaletteExpanded = false;
let paletteHoverTimer = null;

try {
  const savedPosition = JSON.parse(localStorage.getItem('pens.palettePosition') || 'null');
  if (savedPosition && Number.isFinite(savedPosition.left) && Number.isFinite(savedPosition.top)) {
    paletteDock.style.left = `${savedPosition.left}px`;
    paletteDock.style.top = `${savedPosition.top}px`;
    paletteDock.style.right = 'auto';
  }
} catch (error) {
  console.warn('Unable to restore ink palette position:', error);
}

if (fp) {
  let dragState = null;
  const header = document.getElementById('fp-header');
  header?.addEventListener('pointerdown', (event) => {
    if (event.target.closest('button')) return;
    const rect = paletteDock.getBoundingClientRect();
    dragState = { pointerId: event.pointerId, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top };
    header.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  header?.addEventListener('pointermove', (event) => {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    const left = Math.max(8, Math.min(window.innerWidth - paletteDock.offsetWidth - 8, event.clientX - dragState.offsetX));
    const top = Math.max(8, Math.min(window.innerHeight - 52, event.clientY - dragState.offsetY));
    paletteDock.style.left = `${left}px`;
    paletteDock.style.top = `${top}px`;
    paletteDock.style.right = 'auto';
  });
  header?.addEventListener('pointerup', () => {
    if (!dragState) return;
    localStorage.setItem('pens.palettePosition', JSON.stringify({
      left: paletteDock.getBoundingClientRect().left,
      top: paletteDock.getBoundingClientRect().top
    }));
    dragState = null;
  });
}

function expandPalette() {
  isPaletteExpanded = true;
  if (paletteDock) {
    paletteDock.classList.remove('minimized');
    paletteDock.classList.add('expanded');
  }
}

function minimizePalette() {
  if (isPalettePinned) return;
  isPaletteExpanded = false;
  if (paletteDock) {
    paletteDock.classList.remove('expanded');
    paletteDock.classList.add('minimized');
  }
}

function forceMinimize() {
  isPalettePinned = false;
  if (paletteDock) {
    paletteDock.classList.remove('pinned');
    paletteDock.classList.add('unpinned');
    paletteDock.classList.remove('expanded');
    paletteDock.classList.add('minimized');
  }
  if (fpBtnPin) {
    fpBtnPin.classList.remove('active');
    fpBtnPin.title = 'Pin palette open';
  }
  isPaletteExpanded = false;
}

function togglePin() {
  isPalettePinned = !isPalettePinned;
  if (isPalettePinned) {
    if (paletteDock) {
      paletteDock.classList.add('pinned');
      paletteDock.classList.remove('unpinned');
    }
    if (fpBtnPin) {
      fpBtnPin.classList.add('active');
      fpBtnPin.title = 'Unpin palette (hover mode)';
    }
    expandPalette();
  } else {
    if (paletteDock) {
      paletteDock.classList.remove('pinned');
      paletteDock.classList.add('unpinned');
    }
    if (fpBtnPin) {
      fpBtnPin.classList.remove('active');
      fpBtnPin.title = 'Pin palette open';
    }
  }
}

if (paletteDock) {
  // When unpinned, only hover-expand from the side
  paletteDock.addEventListener('mouseenter', () => {
    if (paletteHoverTimer) {
      clearTimeout(paletteHoverTimer);
      paletteHoverTimer = null;
    }
    if (!isPalettePinned) {
      expandPalette();
    }
  });

  paletteDock.addEventListener('mouseleave', () => {
    if (!isPalettePinned) {
      if (paletteHoverTimer) clearTimeout(paletteHoverTimer);
      paletteHoverTimer = setTimeout(() => {
        minimizePalette();
      }, 350);
    }
  });
}

if (fpToggleBtn) {
  fpToggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    expandPalette();
  });
}

if (fpBtnMinimize) {
  fpBtnMinimize.addEventListener('click', (e) => {
    e.stopPropagation();
    forceMinimize();
  });
}

if (fpBtnPin) {
  fpBtnPin.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePin();
  });
}

// Clicking outside collapses the palette when unpinned
window.addEventListener('click', (e) => {
  if (!isPalettePinned && isPaletteExpanded && paletteDock && !paletteDock.contains(e.target)) {
    minimizePalette();
  }
});

function updateSizeDisplay(size) {
  if (fpSizeVal) fpSizeVal.textContent = size + 'px';
  if (fpSize) fpSize.value = size;
}

function broadcastStyle() {
  const tab = getActiveTab();
  if (!tab) return;
  
  const stylePayload = { color: currentColor, size: currentSize, opacity: currentOpacity, tool: currentTool };
  if (tab.pdfViewer) {
    tab.pdfViewer.engines.forEach(eng => { 
      eng.color = currentColor; 
      eng.lineWidth = currentSize; 
      eng.opacity = currentOpacity;
      eng.tool = currentTool;
      eng.updateCursor(); 
    });
  }
  if (tab.webview && tab.webview.send) {
    tab.webview.send('set-style', stylePayload);
  }
}

function updateSwatches() {
  swatches.forEach(s => {
    if (s.dataset.color === currentColor) s.classList.add('active');
    else s.classList.remove('active');
  });
  if (fpColorBadge) {
    fpColorBadge.style.backgroundColor = currentColor;
  }
}

swatches.forEach(swatch => {
  swatch.addEventListener('click', () => {
    currentColor = swatch.dataset.color;
    updateSwatches();
    broadcastStyle();
  });
});

if (fpSize) {
  fpSize.addEventListener('input', (e) => {
    currentSize = parseFloat(e.target.value);
    updateSizeDisplay(currentSize);
    broadcastStyle();
  });
}

if (fpOpacity) {
  fpOpacity.addEventListener('input', (event) => {
    currentOpacity = Number(event.target.value) / 100;
    if (fpOpacityVal) fpOpacityVal.textContent = `${event.target.value}%`;
    broadcastStyle();
  });
}

// Initial palette state
updateSwatches();
updateSizeDisplay(currentSize);

// Initialize App
setAppMode('auto');
if (window.electronAPI && window.electronAPI.getPreloadPath) {
  window.electronAPI.getPreloadPath().then(preloadPath => {
    if (typeof preloadPath === 'string' && preloadPath.length > 0) {
      webviewPreloadPath = 'file:///' + preloadPath.replace(/\\/g, '/');
    }
    createTab();
  }).catch((error) => {
    console.error('Unable to load webview preload path:', error);
    createTab();
  });
} else {
  createTab();
}

// --- Profile Management UI (Stage 1) ---
let currentProfile = null;
const btnProfileMenu = document.getElementById('btn-profile-menu');
const profileDropdown = document.getElementById('profile-dropdown');
const profileList = document.getElementById('profile-list');
const btnAddProfile = document.getElementById('btn-add-profile');
const btnGuestProfile = document.getElementById('btn-guest-profile');
const btnOpenSettings = document.getElementById('btn-open-settings');
const btnShields = document.getElementById('btn-shields');
const shieldsPanel = document.getElementById('shields-panel');
const shieldsEnabled = document.getElementById('shields-enabled');
const btnClearSiteData = document.getElementById('btn-clear-site-data');
const btnDownloads = document.getElementById('btn-downloads');
const btnLock = document.getElementById('btn-lock');
const btnMenu = document.getElementById('btn-menu');
const appMenu = document.getElementById('app-menu');
const btnCustomizeProfile = document.getElementById('btn-customize-profile');
const btnPasswordsProfile = document.getElementById('btn-passwords-profile');

if (window.electronAPI?.getSettings) {
  window.electronAPI.getSettings().then(settings => applyTheme(settings?.theme)).catch(error => {
    console.warn('Unable to load theme settings:', error);
    applyTheme('system');
  });
}

if (btnDownloads) {
  btnDownloads.addEventListener('click', () => createTab('pens://downloads'));
}

if (btnLock) {
  btnLock.addEventListener('click', async () => {
    try {
      await window.electronAPI.lockProfile();
    } catch (error) {
      alert(error.message || 'Unable to lock this profile.');
    }
  });
}

if (btnMenu) {
  btnMenu.addEventListener('click', (event) => {
    event.stopPropagation();
    if (profileDropdown) profileDropdown.style.display = 'none';
    if (appMenu) appMenu.style.display = appMenu.style.display === 'none' ? 'block' : 'none';
  });
}

const menuActions = {
  'new-tab': () => createTab(),
  history: () => createTab('pens://history'),
  downloads: () => createTab('pens://downloads'),
  bookmarks: () => createTab('pens://bookmarks'),
  settings: () => createTab('pens://settings'),
  snapshot: () => btnSnapshot?.click(),
  'clear-data': () => btnClearSiteData?.click(),
  'zoom-in': () => applyZoom(0.2),
  'zoom-out': () => applyZoom(-0.2),
  fullscreen: () => document.documentElement.requestFullscreen?.(),
  'new-window': () => window.electronAPI?.newWindow?.(),
  exit: () => window.electronAPI?.quit?.()
};
appMenu?.querySelectorAll('[data-menu-action]').forEach(button => {
  button.addEventListener('click', () => {
    const action = menuActions[button.dataset.menuAction];
    if (action) action();
    appMenu.style.display = 'none';
  });
});

if (btnShields && shieldsPanel) {
  btnShields.addEventListener('click', async (event) => {
    event.stopPropagation();
    shieldsPanel.style.display = shieldsPanel.style.display === 'none' ? 'block' : 'none';
    if (shieldsPanel.style.display === 'block' && window.electronAPI.getSettings) {
      const settings = await window.electronAPI.getSettings();
      shieldsEnabled.checked = settings.shieldsEnabled !== false;
    }
  });
}

if (shieldsEnabled) {
  shieldsEnabled.addEventListener('change', async () => {
    const settings = await window.electronAPI.getSettings();
    await window.electronAPI.saveSettings({ ...settings, shieldsEnabled: shieldsEnabled.checked });
    btnShields.style.color = shieldsEnabled.checked ? '#188038' : '#5f6368';
  });
}

if (btnClearSiteData) {
  btnClearSiteData.addEventListener('click', async () => {
    await window.electronAPI.clearBrowsingData();
    btnClearSiteData.textContent = 'Site data cleared';
    setTimeout(() => { btnClearSiteData.textContent = 'Clear site data'; }, 1500);
  });
}

if (btnOpenSettings) {
  btnOpenSettings.addEventListener('click', () => {
    profileDropdown.style.display = 'none';
    createTab('pens://settings');
  });
}

btnCustomizeProfile?.addEventListener('click', () => {
  profileDropdown.style.display = 'none';
  createTab('pens://settings');
});
btnPasswordsProfile?.addEventListener('click', () => {
  profileDropdown.style.display = 'none';
  createTab('pens://settings');
});

if (btnProfileMenu) {
  btnProfileMenu.addEventListener('click', async () => {
    const isHidden = profileDropdown.style.display === 'none';
    profileDropdown.style.display = isHidden ? 'block' : 'none';
    
    if (isHidden) {
      profileList.innerHTML = '';
      const profiles = await window.electronAPI.getProfiles();
      profiles.forEach(p => {
        const btn = document.createElement('button');
        btn.className = 'profile-picker-item';
        if (p.id === currentProfile?.id) btn.classList.add('active');
        const avatar = document.createElement('span');
        if (String(p.avatar || '').startsWith('data:image/')) {
          const image = document.createElement('img');
          image.src = p.avatar;
          image.alt = `${profileDisplayName(p)} avatar`;
          image.width = 28;
          image.height = 28;
          image.style.cssText = 'width: 28px; height: 28px; border-radius: 50%; object-fit: cover;';
          avatar.appendChild(image);
        } else {
          avatar.textContent = p.avatar || profileDisplayName(p).charAt(0).toUpperCase();
        }
        const name = document.createElement('span');
        name.textContent = profileDisplayName(p);
        btn.append(avatar, name);
        btn.onclick = () => {
          window.electronAPI.openProfile(p.id);
          profileDropdown.style.display = 'none';
        };
        profileList.appendChild(btn);
      });
    }
  });

  // --- New Profile Modal Management ---
  const newProfileModal = document.getElementById('new-profile-modal');
  const modalProfileName = document.getElementById('modal-profile-name');
  const modalProfileBtnCancel = document.getElementById('modal-profile-btn-cancel');
  const modalProfileBtnCreate = document.getElementById('modal-profile-btn-create');
  if (newProfileModal && newProfileModal.parentElement !== document.body) {
    document.body.appendChild(newProfileModal);
  }
  let selectedProfileColor = '#1a73e8';
  let selectedProfileAvatar = '👤';

  // Profile modal color picker
  document.querySelectorAll('.profile-color-opt').forEach(opt => {
    opt.addEventListener('click', () => {
      document.querySelectorAll('.profile-color-opt').forEach(o => {
        o.classList.remove('active');
        o.style.borderColor = 'transparent';
        o.style.boxShadow = 'none';
      });
      opt.classList.add('active');
      opt.style.borderColor = '#fff';
      opt.style.boxShadow = `0 0 0 2px ${opt.dataset.color}`;
      selectedProfileColor = opt.dataset.color;
    });
  });

  // Profile modal avatar picker
  document.querySelectorAll('.profile-avatar-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.profile-avatar-opt').forEach(b => {
        b.classList.remove('active');
        b.style.borderColor = '#dadce0';
        b.style.background = 'white';
      });
      btn.classList.add('active');
      btn.style.borderColor = '#1a73e8';
      btn.style.background = '#e8f0fe';
      selectedProfileAvatar = btn.dataset.avatar;
    });
  });

  btnAddProfile.addEventListener('click', () => {
    profileDropdown.style.display = 'none';
    if (modalProfileName) modalProfileName.value = '';
    if (newProfileModal) {
      newProfileModal.style.display = 'flex';
      setTimeout(() => modalProfileName && modalProfileName.focus(), 50);
    }
  });

  if (modalProfileBtnCancel && newProfileModal) {
    modalProfileBtnCancel.addEventListener('click', () => {
      newProfileModal.style.display = 'none';
    });
  }

  if (modalProfileBtnCreate && newProfileModal) {
    modalProfileBtnCreate.addEventListener('click', async () => {
      const name = modalProfileName ? modalProfileName.value.trim() : '';
      if (!name) {
        if (modalProfileName) modalProfileName.focus();
        return;
      }
      modalProfileBtnCreate.disabled = true;
      try {
        const newProfile = await window.electronAPI.createProfile(name, selectedProfileColor, selectedProfileAvatar);
        if (!newProfile || !newProfile.id || newProfile.error) {
          throw new Error('Profile could not be created.');
        }
        newProfileModal.style.display = 'none';
        await window.electronAPI.openProfile(newProfile.id);
      } catch (error) {
        console.error('Unable to create profile:', error);
        alert(`Unable to create profile: ${error.message}`);
      } finally {
        modalProfileBtnCreate.disabled = false;
      }
    });
  }

  if (modalProfileName) {
    modalProfileName.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        if (modalProfileBtnCreate) modalProfileBtnCreate.click();
      } else if (e.key === 'Escape') {
        if (newProfileModal) newProfileModal.style.display = 'none';
      }
    });
  }

  btnGuestProfile.addEventListener('click', () => {
    profileDropdown.style.display = 'none';
    window.electronAPI.openProfile('guest');
  });

  // Click outside to close dropdown
  window.addEventListener('click', (e) => {
    if (!e.target.closest('.profile-container')) profileDropdown.style.display = 'none';
    if (appMenu && !e.target.closest('#app-menu') && !e.target.closest('#btn-menu')) appMenu.style.display = 'none';
    if (shieldsPanel && !e.target.closest('#shields-panel') && !e.target.closest('#btn-shields')) {
      shieldsPanel.style.display = 'none';
    }
  });
}

// --- Clear Screen Ink Logic ---
const btnClearInk = document.getElementById('btn-clear-ink');
if (btnClearInk) {
  btnClearInk.addEventListener('click', () => {
    const tab = getActiveTab();
    if (!tab) return;
    if (tab.pdfViewer) {
      tab.pdfViewer.clear();
    } else if (tab.engine) {
      tab.engine.clear();
    } else if (tab.webview && tab.webview.send) {
      tab.webview.send('clear-strokes');
    }
  });
}

if (window.electronAPI && window.electronAPI.onProfileInfo) {
  window.electronAPI.onProfileInfo((profile) => {
    updateProfileUI(profile);
  });
}

if (window.electronAPI && window.electronAPI.getCurrentProfile) {
  window.electronAPI.getCurrentProfile().then((profile) => {
    updateProfileUI(profile);
  }).catch((error) => console.error('Unable to load current profile:', error));
}

// --- Bookmarks UI (Stage 2 foundation) ---
const btnAddBookmark = document.getElementById('btn-add-bookmark');
const bookmarksList = document.getElementById('bookmarks-list');

async function renderBookmarks() {
  if (!bookmarksList || !window.electronAPI || !window.electronAPI.getBookmarks) return;
  bookmarksList.innerHTML = '';
  const bookmarks = await window.electronAPI.getBookmarks();
  bookmarks.forEach(b => {
    const el = document.createElement('a');
    el.textContent = b.title || b.url;
    el.title = b.url;
    el.style.cssText = 'padding: 4px 8px; background: white; border-radius: 4px; cursor: pointer; text-decoration: none; color: #333; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; border: 1px solid #ccc;';
    el.onclick = () => {
      // Small visual feedback before navigation
      el.style.backgroundColor = '#e8f0fe';
      setTimeout(() => el.style.backgroundColor = 'white', 200);
      createTab(b.url);
    };
    
    // Right click to delete
    el.addEventListener('contextmenu', async (e) => {
      e.preventDefault();
      if(confirm(`Delete bookmark '${b.title}'?`)) {
        await window.electronAPI.removeBookmark(b.id);
        renderBookmarks();
      }
    });
    
    bookmarksList.appendChild(el);
  });
}

if (btnAddBookmark) {
  btnAddBookmark.addEventListener('click', async () => {
    const tab = getActiveTab();
    if (!tab) return;
    const url = tab.url;
    const title = tab.titleEl.textContent;
    if (url === 'pens://home') return;
    
    await window.electronAPI.addBookmark(url, title);
    renderBookmarks();
  });
}

// Initial render
renderBookmarks();

// History hook:
// We need to hook into the webview's 'did-navigate' or 'did-stop-loading' to record history
function recordHistory(url, title) {
  if (window.electronAPI && window.electronAPI.addHistory) {
    window.electronAPI.addHistory(url, title);
  }
}
