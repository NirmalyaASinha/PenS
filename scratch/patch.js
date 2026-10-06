const fs = require('fs');
let content = fs.readFileSync('renderer/renderer.js', 'utf8');

const targetStr = `  if (url === 'pens://home') {
    viewContainer.innerHTML = \`
      <div class="home-container">
        <div class="home-left">
          <button class="home-browse-btn" id="home-browse-\${tabId}">Browse</button>
          <div class="home-bookmarks">Bookmarks</div>
        </div>
        <div class="home-right">
          <div class="home-title">Welcome to PenS !</div>
          <div class="home-subtitle" id="home-subtitle-\${tabId}">Hey User</div>
          <div class="home-notes-title">Notebooks</div>
          <div class="notes-grid" id="notes-grid-\${tabId}"></div>
        </div>
      </div>
    \`;
    contentArea.appendChild(viewContainer);
    tabs.push(tabObj);
    // ... Home init logic (same as before) ...
    setTimeout(async () => {
      document.getElementById(\`home-browse-\${tabId}\`).addEventListener('click', () => {
        addressBar.focus();
        addressBar.select();
      });
      
      if (window.electronAPI) {
        if (window.electronAPI.getUsername) {
          const username = await window.electronAPI.getUsername();
          document.getElementById(\`home-subtitle-\${tabId}\`).textContent = \`Hey \${username}\`;
        }
        if (window.electronAPI.listNotes) {
          const grid = document.getElementById(\`notes-grid-\${tabId}\`);
          try {
            const notes = await window.electronAPI.listNotes();
            notes.forEach(note => {
              const card = document.createElement('div');
              card.className = 'note-card';
              let displayName = note.id;
              try {
                 if (note.type === 'web') displayName = new URL(note.id).hostname || note.id;
                 else displayName = note.id.split('\\\\').pop().split('/').pop();
              } catch(e) {}
              card.textContent = \`\${displayName} (\${note.strokeCount} strokes)\`;
              card.onclick = () => {
                if (note.type === 'web') createTab(note.id);
                else createPdfTab(note.id);
              };
              grid.appendChild(card);
            });
          } catch(e) { console.error(e); }
        }
      }
    }, 0);
  } else if (url === 'pens://history') {`;

const newStr = `  if (url === 'pens://home') {
    viewContainer.innerHTML = \`
      <div class="home-container" style="display: flex; gap: 20px; padding: 20px; height: 100%; box-sizing: border-box; background: var(--bg-color, #fff); color: var(--text-color, #000);">
        <div style="flex: 1; display: flex; flex-direction: column; gap: 20px;">
          <div class="card browse-card" style="padding: 40px; text-align: center; border: 1px solid #ccc; border-radius: 8px;">
            <h2 style="font-size: 2em; margin-bottom: 20px; font-family: var(--font-sketch, cursive);">Browse</h2>
            <button id="home-browse-\${tabId}" style="width: 80%; padding: 12px; border-radius: 24px; border: 1px solid #ccc; font-size: 16px; text-align: left; background: #fff; cursor: pointer; color: #666;">Search or enter web address...</button>
          </div>
          <div class="card bookmarks-card" style="padding: 20px; border: 1px solid #ccc; border-radius: 8px;">
            <h3>Bookmarks</h3>
            <div id="home-bookmarks-grid-\${tabId}" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap: 10px;"></div>
          </div>
        </div>
        <div style="flex: 1; display: flex; flex-direction: column; gap: 20px;">
          <div class="greeting">
            <h1 style="font-family: var(--font-sketch, cursive);">Welcome, <span id="home-profile-name-\${tabId}">User</span></h1>
            <p contenteditable="true" id="home-subtitle-\${tabId}" style="color: #666;">How is your day?</p>
          </div>
          <div class="card notes-card" style="padding: 20px; border: 1px solid #ccc; border-radius: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <h3>My notes</h3>
              <a href="#" id="home-see-all-notes-\${tabId}" style="color: #1a73e8; text-decoration: none;">See all</a>
            </div>
            <div id="notes-grid-\${tabId}" style="display: flex; flex-direction: column; gap: 10px; margin-top: 10px;"></div>
          </div>
        </div>
      </div>
    \`;
    contentArea.appendChild(viewContainer);
    tabs.push(tabObj);

    setTimeout(async () => {
      document.getElementById(\`home-browse-\${tabId}\`).addEventListener('click', () => {
        addressBar.focus();
        addressBar.select();
      });
      document.getElementById(\`home-see-all-notes-\${tabId}\`).addEventListener('click', (e) => {
        e.preventDefault();
        createTab('pens://notes');
      });
      
      if (window.electronAPI) {
        if (window.electronAPI.getUsername) {
          const username = await window.electronAPI.getUsername();
          document.getElementById(\`home-profile-name-\${tabId}\`).textContent = username;
          document.getElementById(\`home-subtitle-\${tabId}\`).textContent = \`How is your day?\`;
        }
        if (window.electronAPI.listNotes) {
          const grid = document.getElementById(\`notes-grid-\${tabId}\`);
          try {
            const notes = await window.electronAPI.listNotes();
            notes.slice(0, 4).forEach(note => {
              const card = document.createElement('div');
              card.style.cssText = 'padding: 10px; border: 1px solid #eee; border-radius: 4px; display: flex; gap: 10px; cursor: pointer; align-items: center;';
              let displayName = note.id;
              try {
                 if (note.type === 'web') displayName = new URL(note.id).hostname || note.id;
                 else displayName = note.id.split('\\\\').pop().split('/').pop();
              } catch(e) {}
              const thumb = document.createElement('div');
              thumb.style.cssText = 'width: 40px; height: 40px; background: #ddd; border-radius: 4px;';
              if (note.thumbnail) thumb.style.background = \`url(\${note.thumbnail}) center/cover\`;
              const textDiv = document.createElement('div');
              textDiv.textContent = \`\${displayName} (\${note.strokeCount || 0} strokes)\`;
              card.appendChild(thumb);
              card.appendChild(textDiv);
              card.onclick = () => {
                if (note.type === 'web') createTab(note.id);
                else createPdfTab(note.id);
              };
              grid.appendChild(card);
            });
            if (notes.length === 0) grid.innerHTML = '<div style="color: #666; font-style: italic;">No notes yet.</div>';
          } catch(e) { console.error(e); }
        }
      }
    }, 0);
  } else if (url === 'pens://notes') {
    tabObj.titleEl.textContent = 'My Notes';
    viewContainer.innerHTML = \`
      <div style="padding: 40px; font-family: sans-serif; background: white; height: 100%; overflow-y: auto;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h1 style="font-family: var(--font-sketch, cursive);">My notes</h1>
          <input type="text" id="notes-search-\${tabId}" placeholder="Search notes..." style="padding: 8px 16px; border-radius: 20px; border: 1px solid #ccc; width: 300px;">
        </div>
        <div style="display: flex; gap: 10px; margin-bottom: 20px;">
          <button style="padding: 8px 16px; border-radius: 16px; border: 1px solid #1a73e8; background: #e8f0fe; color: #1a73e8; cursor: pointer;">Recent</button>
          <button style="padding: 8px 16px; border-radius: 16px; border: 1px solid #ccc; background: white; cursor: pointer;">Name</button>
          <button style="padding: 8px 16px; border-radius: 16px; border: 1px solid #ccc; background: white; cursor: pointer;">Web</button>
          <button style="padding: 8px 16px; border-radius: 16px; border: 1px solid #ccc; background: white; cursor: pointer;">PDF</button>
        </div>
        <ol id="full-notes-list-\${tabId}" style="list-style-type: decimal; padding-left: 20px; display: flex; flex-direction: column; gap: 10px; margin: 0;"></ol>
      </div>
    \`;
    contentArea.appendChild(viewContainer);
    tabs.push(tabObj);

    setTimeout(async () => {
      if (window.electronAPI && window.electronAPI.listNotes) {
        const list = document.getElementById(\`full-notes-list-\${tabId}\`);
        try {
          const notes = await window.electronAPI.listNotes();
          notes.forEach(note => {
            const li = document.createElement('li');
            li.style.cssText = 'padding: 10px; border-bottom: 1px solid #eee; display: flex; gap: 20px; align-items: center; cursor: pointer;';
            let displayName = note.title || note.id;
            try {
               if (!note.title) {
                 if (note.type === 'web') displayName = new URL(note.id).hostname || note.id;
                 else displayName = note.id.split('\\\\').pop().split('/').pop();
               }
            } catch(e) {}
            const thumb = document.createElement('div');
            thumb.style.cssText = 'width: 60px; height: 60px; background: #ddd; border-radius: 4px; flex-shrink: 0;';
            if (note.thumbnail) thumb.style.background = \`url(\${note.thumbnail}) center/cover\`;
            const info = document.createElement('div');
            info.innerHTML = \\\`<strong style="font-size: 16px;">\\\${displayName}</strong><br><span style="color: #666; font-size: 12px;">\\\${note.type.toUpperCase()} • \\\${note.strokeCount || 0} strokes • Last edited: \\\${new Date(note.updated).toLocaleDateString()}</span>\\\`;
            li.appendChild(thumb);
            li.appendChild(info);
            li.onclick = () => {
              if (note.type === 'web') createTab(note.id);
              else createPdfTab(note.id);
            };
            list.appendChild(li);
          });
          if (notes.length === 0) {
            list.style.listStyle = 'none';
            list.innerHTML = '<li style="color: #666; font-style: italic;">No notes yet.</li>';
          }
        } catch(e) { console.error(e); }
      }
    }, 0);
  } else if (url === 'pens://history') {`;

if (content.includes(targetStr)) {
  fs.writeFileSync('renderer/renderer.js', content.replace(targetStr, newStr));
  console.log('Success');
} else {
  console.log('Target string not found');
}
