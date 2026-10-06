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
const btnUndo = document.getElementById('btn-undo');
const btnRedo = document.getElementById('btn-redo');
const btnPen = document.getElementById('btn-pen');
const btnHighlighter = document.getElementById('btn-highlighter');
const btnEraser = document.getElementById('btn-eraser');
const effectiveModeIndicator = document.getElementById('effective-mode-indicator');

let tabs = [];
let activeTabId = null;
let tabCounter = 0;
let webviewPreloadPath = '';

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
    effectiveModeIndicator.style.backgroundColor = mode === 'pen' ? '#1a73e8' : '#ccc';
    
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

// --- Shortcuts & Zoom ---
let currentZoom = 1;
function applyZoom(delta) {
  const tab = getActiveTab();
  if (!tab) return;
  if (delta === 0) currentZoom = 1;
  else currentZoom += delta;
  
  if (currentZoom < 0.25) currentZoom = 0.25;
  if (currentZoom > 5) currentZoom = 5;

  if (tab.webview) tab.webview.setZoomLevel(Math.log(currentZoom) / Math.log(1.2));
  // PDF viewer zooming logic could be added here later if implemented in pdf-viewer.js
}

btnZoomIn.addEventListener('click', () => applyZoom(0.2));
btnZoomOut.addEventListener('click', () => applyZoom(-0.2));

window.addEventListener('keydown', (e) => {
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
      case ']': currentSize = Math.min(40, currentSize + 0.5); fpSize.value = currentSize; broadcastStyle(); break;
      case '[': currentSize = Math.max(1, currentSize - 0.5); fpSize.value = currentSize; broadcastStyle(); break;
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
    fpSize.value = currentSize;
    updateSwatches();
  } else {
    currentTool = 'pen';
    btnPen.classList.add('active');
    if (currentSize === 20) currentSize = 2.5; // switch back size
    fpSize.value = currentSize;
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
  if (tab && tab.webview) {
    btnSnapshot.style.opacity = '0.5';
    const wcId = tab.webview.getWebContentsId();
    const pdfPath = await window.electronAPI.printToPdf(wcId);
    btnSnapshot.style.opacity = '1';
    if (pdfPath) {
      createPdfTab(pdfPath);
    } else {
      alert("Failed to snapshot page.");
    }
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
  // ... (keep existing)
  if (!tab || tab.isPdf || tab.url === 'pens://home' || tab.url.startsWith('pens://')) {
    btnSaveToggle.style.display = 'none';
  } else {
    btnSaveToggle.style.display = 'flex';
    if (tab.saveEnabled) {
      btnSaveToggle.classList.add('active');
      const urlId = tab.url ? tab.url.split('?')[0].split('#')[0] : '';
      btnSaveToggle.title = `Save notes for this URL (On)\nSaving to: ${urlId}`;
    } else {
      btnSaveToggle.classList.remove('active');
      btnSaveToggle.title = `Save notes for this URL (Off)`;
    }
  }
}

btnSaveToggle.addEventListener('click', () => {
  const tab = getActiveTab();
  if (tab && !tab.isPdf && !tab.url.startsWith('pens://')) {
    tab.saveEnabled = !tab.saveEnabled;
    updateSaveToggleUI(tab);
  }
});

function getActiveTab() { return tabs.find(t => t.id === activeTabId); }

// ... createPdfTab ... (skip replacing it, actually I can just do a precise replace for closeTab and keydown)

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
  const tabObj = { id: tabId, el: tabEl, viewEl: viewContainer, titleEl, isPdf: true, url: fileUrl };
  tabs.push(tabObj);
  
  if (window.PDFViewer) tabObj.pdfViewer = new window.PDFViewer(viewContainer, fileUrl);
  activateTab(tabId);
}

function createTab(url = 'pens://home') {
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
  closeEl.onclick = (e) => { e.stopPropagation(); closeTab(tabId); };
  
  tabEl.appendChild(titleEl);
  tabEl.appendChild(closeEl);
  tabEl.onclick = () => activateTab(tabId);
  tabsContainer.insertBefore(tabEl, newTabBtn);
  
  const viewContainer = document.createElement('div');
  viewContainer.className = 'view-container';
  viewContainer.id = `view-${tabId}`;
  
  const tabObj = { id: tabId, el: tabEl, viewEl: viewContainer, titleEl, url, saveEnabled: true };
  
  if (url === 'pens://home') {
    viewContainer.innerHTML = `
      <div class="home-container" style="display: flex; height: 100%; font-family: 'Segoe UI', sans-serif; background: #fff;">
        <div class="home-left" style="flex: 1; padding: 40px; border-right: 1px solid #eee; display: flex; flex-direction: column;">
          <div style="background: #f8f9fa; border-radius: 16px; padding: 30px; text-align: center; cursor: pointer; transition: transform 0.2s;" id="home-browse-card-${tabId}">
            <h1 style="margin: 0 0 20px 0; font-size: 32px; color: #1a73e8;">Browse the Web</h1>
            <div style="background: white; border: 1px solid #ddd; border-radius: 24px; padding: 12px 20px; display: flex; align-items: center; box-shadow: 0 2px 6px rgba(0,0,0,0.05);">
              <span style="color: #666; margin-right: 10px;">🔍</span>
              <span style="color: #999;">Search or enter web address...</span>
            </div>
          </div>
          
          <h3 style="margin-top: 40px; color: #333;">Bookmarks</h3>
          <div id="home-bookmarks-${tabId}" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap: 16px; margin-top: 16px;"></div>
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
          <div class="home-title">Welcome to PenS ! Updated</div>
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
      document.getElementById(`home-browse-card-${tabId}`).addEventListener('click', () => {
        addressBar.focus();
        addressBar.select();
      });
      
      document.getElementById(`home-see-all-${tabId}`).addEventListener('click', (e) => {
        e.preventDefault();
        createTab('pens://notes');
      });

      if (window.electronAPI) {
        if (window.electronAPI.getUsername) {
          window.electronAPI.getUsername().then(username => {
            const hour = new Date().getHours();
            const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
            document.getElementById(`home-greeting-${tabId}`).textContent = `${greeting}, ${username}`;
          });
        }
        
        if (window.electronAPI.getBookmarks) {
           window.electronAPI.getBookmarks().then(bookmarks => {
             const bookmarksList = document.getElementById(`home-bookmarks-${tabId}`);
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
            try {
              notes.sort((a, b) => b.updated - a.updated);
              
              if (notes.length > 0) {
                const latest = notes[0];
                const contSection = document.getElementById(`home-continue-${tabId}`);
                const contCard = document.getElementById(`continue-card-${tabId}`);
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

          let title = note.title || note.id;
          
          const thumbContainer = document.createElement('div');
          thumbContainer.style.cssText = 'height: 140px; background: #f1f3f4; display: flex; align-items: center; justify-content: center; border-bottom: 1px solid #eee; position: relative;';
          if (note.thumbnail) {
            const img = document.createElement('img');
            img.src = note.thumbnail;
            img.style.cssText = 'width: 100%; height: 100%; object-fit: cover;';
            thumbContainer.appendChild(img);
          } else {
            const typeIcon = note.type === 'pdf' ? '📄' : note.type === 'blank' ? '📓' : '🌐';
            thumbContainer.innerHTML = `<span style="font-size: 48px; opacity: 0.5;">${typeIcon}</span>`;
          }
          
          const info = document.createElement('div');
          info.style.cssText = 'padding: 16px; flex: 1; display: flex; flex-direction: column;';
          info.innerHTML = `
            <div style="font-weight: 500; font-size: 15px; margin-bottom: 8px; color: #202124; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${title}</div>
            <div style="margin-top: auto; display: flex; justify-content: space-between; font-size: 12px; color: #5f6368;">
              <span>${new Date(note.updated).toLocaleDateString()}</span>
              <span>${note.strokeCount} strokes</span>
            </div>
          `;
          
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
      <div style="padding: 40px; font-family: sans-serif; background: white; height: 100%; overflow-y: auto;">
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
      <div style="padding: 40px; font-family: sans-serif; background: white; height: 100%; overflow-y: auto;">
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
      <div style="padding: 40px; font-family: sans-serif; background: white; height: 100%; overflow-y: auto;">
        <h2>Settings</h2>
        <div style="max-width: 600px;">
          <div style="margin-bottom: 20px;">
            <label style="display: block; font-weight: bold;">Theme (Currently applies to active profile sync)</label>
            <select id="setting-theme-${tabId}" style="width: 100%; padding: 8px;">
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>
          <div style="margin-bottom: 20px;">
            <label style="display: block; font-weight: bold;">Adblocker / Shields</label>
            <input type="checkbox" id="setting-shields-${tabId}"> Enable shields (Blocks trackers)
          </div>
          <div style="margin-bottom: 20px;">
            <label style="display: block; font-weight: bold;">Data & Privacy</label>
            <button id="btn-clear-data-${tabId}" style="padding: 8px; background: #ea4335; color: white; border: none; border-radius: 4px; cursor: pointer; margin-right: 10px;">Clear Cache & Cookies</button>
            <button id="btn-export-profile-${tabId}" style="padding: 8px; background: #34a853; color: white; border: none; border-radius: 4px; cursor: pointer;">Export Profile (.penprofile)</button>
          </div>
          <button id="btn-save-settings-${tabId}" style="padding: 10px 20px; background: #1a73e8; color: white; border: none; border-radius: 4px; cursor: pointer;">Save Settings</button>
          
          <hr style="margin: 40px 0; border: 0; border-top: 1px solid #ddd;">
          
          <h2>Saved Passwords</h2>
          <div id="passwords-list-${tabId}">Loading...</div>
          <div style="margin-top: 10px;">
             <input type="text" id="add-pass-url-${tabId}" placeholder="Site URL" style="padding: 6px;">
             <input type="text" id="add-pass-user-${tabId}" placeholder="Username" style="padding: 6px;">
             <input type="password" id="add-pass-pass-${tabId}" placeholder="Password" style="padding: 6px;">
             <button id="btn-add-pass-${tabId}" style="padding: 6px;">Add Password</button>
          </div>
        </div>
      </div>
    `;
    contentArea.appendChild(viewContainer);
    tabs.push(tabObj);

    setTimeout(async () => {
      if (window.electronAPI && window.electronAPI.getSettings) {
        const settings = await window.electronAPI.getSettings();
        document.getElementById(`setting-theme-${tabId}`).value = settings.theme || 'system';
        document.getElementById(`setting-shields-${tabId}`).checked = settings.shieldsEnabled !== false;

        document.getElementById(`btn-save-settings-${tabId}`).onclick = async () => {
          const newSettings = {
            theme: document.getElementById(`setting-theme-${tabId}`).value,
            shieldsEnabled: document.getElementById(`setting-shields-${tabId}`).checked
          };
          await window.electronAPI.saveSettings(newSettings);
          alert('Settings saved!');
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
           if (passes.length === 0) list.innerHTML = 'No passwords saved yet.';
        }
      };
      renderPasswords();
      
      document.getElementById(`btn-add-pass-${tabId}`).onclick = async () => {
        const url = document.getElementById(`add-pass-url-${tabId}`).value;
        const user = document.getElementById(`add-pass-user-${tabId}`).value;
        const pass = document.getElementById(`add-pass-pass-${tabId}`).value;
        if (url && user && pass) {
          await window.electronAPI.addPassword(url, user, pass);
          renderPasswords();
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
      updateSaveToggleUI(tabObj);
    }
    
    recordHistory(tabObj.url, tabObj.titleEl.textContent);
    
    const urlId = tabObj.url.split('?')[0].split('#')[0];
    const data = await window.electronAPI.loadNotes(urlId);
    if (data && webview.send) webview.send('load-strokes', data);
    
    if (webview.send) {
      webview.send('set-mode', window.effectiveMode);
      webview.send('set-eraser', window.isEraser);
      broadcastStyle();
    }
  });

  webview.addEventListener('ipc-message', (e) => {
    if (e.channel === 'save-strokes') {
      if (!tabObj.saveEnabled) return;
      const { strokes, thumbnail } = e.args[0] || {};
      const payloadStrokes = strokes || e.args[0];
      const data = { version: 1, source: { type: 'web', url: tabObj.url }, strokes: payloadStrokes, thumbnail };
      const urlId = tabObj.url.split('?')[0].split('#')[0];
      window.electronAPI.saveNotes(urlId, data);
    } else if (e.channel === 'pointer-activity') {
      window.handlePointerActivity(e.args[0]);
    } else if (e.channel === 'pointer-leave') {
      window.handlePointerLeave(e.args[0]);
    }
  });
}

function activateTab(tabId) {
  activeTabId = tabId;
  tabs.forEach(tab => {
    if (tab.id === tabId) {
      tab.el.classList.add('active');
      tab.viewEl.classList.add('active');
      if (tab.url === 'pens://home') {
        addressBar.value = '';
      } else {
        addressBar.value = (tab.webview && tab.webview.getURL) ? (tab.webview.getURL() || tab.url) : tab.url;
      }
      if (tab.pdfViewer) {
        tab.pdfViewer.setMode(window.effectiveMode);
        tab.pdfViewer.setEraser(window.isEraser);
      }
      updateSaveToggleUI(tab);
    } else {
      tab.el.classList.remove('active');
      tab.viewEl.classList.remove('active');
    }
  });
  broadcastStyle();
}

function closeTab(tabId) {
  const index = tabs.findIndex(t => t.id === tabId);
  if (index === -1) return;
  const tab = tabs[index];
  
  if (tab.url && !tab.url.startsWith('pens://')) closedTabs.push(tab.url);
  if (closedTabs.length > 20) closedTabs.shift();

  tab.el.remove();
  tab.viewEl.remove();
  tabs.splice(index, 1);
  if (tabs.length === 0) createTab();
  else if (activeTabId === tabId) activateTab(tabs[Math.max(0, index - 1)].id);
}

// Navigation
function navigateTo(url) {
  const tab = getActiveTab();
  if (!tab) return;
  if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('file://') && !url.startsWith('pens://')) url = 'https://' + url;
  
  if (url.startsWith('http://') && !url.startsWith('http://localhost') && !url.startsWith('http://127.0.0.1')) {
    if (!confirm('Warning: This site uses unencrypted HTTP which is insecure. Do you still want to proceed?')) {
      return;
    }
  }
  
  if (tab.url === 'pens://home' && url !== 'pens://home') {
    tab.url = url;
    setupWebview(tab, url);
  } else if (tab.webview) {
    tab.url = url;
    tab.webview.setAttribute('src', url);
  }
}

btnBack.addEventListener('click', () => { const tab = getActiveTab(); if (tab && tab.webview && tab.webview.canGoBack()) tab.webview.goBack(); });
btnForward.addEventListener('click', () => { const tab = getActiveTab(); if (tab && tab.webview && tab.webview.canGoForward()) tab.webview.goForward(); });
btnReload.addEventListener('click', () => { const tab = getActiveTab(); if (tab && tab.webview) tab.webview.reload(); });
newTabBtn.addEventListener('click', () => createTab());


// --- Floating Palette Logic ---
let currentColor = '#1a73e8';
let currentSize = 2.5;

const fp = document.getElementById('floating-palette');
const fpHeader = document.getElementById('fp-header');
const swatches = document.querySelectorAll('.color-swatch');
const fpSize = document.getElementById('fp-size');

let isDragging = false, dragOffX = 0, dragOffY = 0;
fpHeader.addEventListener('pointerdown', (e) => {
  isDragging = true;
  dragOffX = e.clientX - fp.offsetLeft;
  dragOffY = e.clientY - fp.offsetTop;
  fpHeader.setPointerCapture(e.pointerId);
});
fpHeader.addEventListener('pointermove', (e) => {
  if (!isDragging) return;
  fp.style.left = (e.clientX - dragOffX) + 'px';
  fp.style.top = (e.clientY - dragOffY) + 'px';
  fp.style.right = 'auto'; 
});
fpHeader.addEventListener('pointerup', (e) => {
  isDragging = false;
  fpHeader.releasePointerCapture(e.pointerId);
});

function broadcastStyle() {
  const tab = getActiveTab();
  if (!tab) return;
  
  const stylePayload = { color: currentColor, size: currentSize, tool: currentTool };
  if (tab.pdfViewer) {
    tab.pdfViewer.engines.forEach(eng => { 
      eng.color = currentColor; 
      eng.lineWidth = currentSize; 
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
}

swatches.forEach(swatch => {
  swatch.addEventListener('click', () => {
    currentColor = swatch.dataset.color;
    updateSwatches();
    broadcastStyle();
  });
});

fpSize.addEventListener('input', (e) => {
  currentSize = parseFloat(e.target.value);
  broadcastStyle();
});

// Initialize App
setAppMode('auto');
if (window.electronAPI && window.electronAPI.getPreloadPath) {
  window.electronAPI.getPreloadPath().then(path => {
    webviewPreloadPath = 'file:///' + path.replace(/\\/g, '/');
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

if (btnProfileMenu) {
  btnProfileMenu.addEventListener('click', async () => {
    const isHidden = profileDropdown.style.display === 'none';
    profileDropdown.style.display = isHidden ? 'block' : 'none';
    
    if (isHidden) {
      profileList.innerHTML = '';
      const profiles = await window.electronAPI.getProfiles();
      profiles.forEach(p => {
        const btn = document.createElement('button');
        btn.style.cssText = `width: 100%; text-align: left; padding: 8px; margin-bottom: 4px; display: flex; align-items: center; gap: 8px; ${p.id === currentProfile?.id ? 'background: #e8f0fe;' : ''}`;
        btn.innerHTML = `<span>${p.avatar}</span> <span>${p.name}</span>`;
        btn.onclick = () => {
          window.electronAPI.openProfile(p.id);
          profileDropdown.style.display = 'none';
        };
        profileList.appendChild(btn);
      });
    }
  });

  btnAddProfile.addEventListener('click', async () => {
    const name = prompt("Enter new profile name:", "Work");
    if (name) {
      const colors = ['#ea4335', '#fbbc04', '#34a853', '#9c27b0'];
      const randomColor = colors[Math.floor(Math.random() * colors.length)];
      const newProfile = await window.electronAPI.createProfile(name, randomColor, '👤');
      window.electronAPI.openProfile(newProfile.id);
      profileDropdown.style.display = 'none';
    }
  });

  btnGuestProfile.addEventListener('click', () => {
    window.electronAPI.openProfile('guest');
    profileDropdown.style.display = 'none';
  });

  // Click outside to close dropdown
  window.addEventListener('click', (e) => {
    if (!e.target.closest('.profile-container')) profileDropdown.style.display = 'none';
  });
}

if (window.electronAPI && window.electronAPI.onProfileInfo) {
  window.electronAPI.onProfileInfo((profile) => {
    currentProfile = profile;
    if (btnProfileMenu) {
      btnProfileMenu.textContent = profile.avatar;
      btnProfileMenu.style.borderColor = profile.color;
    }
    document.documentElement.style.setProperty('--accent-color', profile.color);
    document.getElementById('titlebar').style.backgroundColor = profile.color;
  });
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
