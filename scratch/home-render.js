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
          <div id="home-bookmarks-${tabId}" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap: 16px; margin-top: 16px;">
            <!-- Bookmarks loaded here -->
          </div>
        </div>
        
        <div class="home-right" style="flex: 1.5; padding: 40px; background: #fafafa; display: flex; flex-direction: column; overflow-y: auto;">
          <h1 id="home-greeting-${tabId}" style="margin: 0; font-size: 28px; color: #202124;">Welcome back</h1>
          <p style="color: #5f6368; font-size: 16px; margin-top: 8px;">How is your day?</p>
          
          <div id="home-continue-${tabId}" style="margin-top: 30px; display: none;">
            <h3 style="color: #333; margin-bottom: 12px;">Continue where you left off</h3>
            <div id="continue-card-${tabId}" style="background: white; border: 1px solid #ddd; border-radius: 12px; padding: 16px; cursor: pointer; display: flex; align-items: center; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
            </div>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 40px;">
            <h3 style="margin: 0; color: #333;">My notes</h3>
            <a href="#" id="home-see-all-${tabId}" style="color: #1a73e8; text-decoration: none; font-weight: 500;">See all →</a>
          </div>
          
          <div id="notes-grid-${tabId}" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 20px; margin-top: 20px;">
            <!-- Notes loaded here -->
          </div>
        </div>
      </div>
    `;
    contentArea.appendChild(viewContainer);
    tabs.push(tabObj);

    setTimeout(async () => {
      document.getElementById(\`home-browse-card-\${tabId}\`).addEventListener('click', () => {
        addressBar.focus();
        addressBar.select();
      });
      
      document.getElementById(\`home-see-all-\${tabId}\`).addEventListener('click', (e) => {
        e.preventDefault();
        createTab('pens://notes');
      });

      if (window.electronAPI) {
        if (window.electronAPI.getUsername) {
          const username = await window.electronAPI.getUsername();
          const hour = new Date().getHours();
          const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
          document.getElementById(\`home-greeting-\${tabId}\`).textContent = \`\${greeting}, \${username}\`;
        }
        
        if (window.electronAPI.getBookmarks) {
           const bookmarksList = document.getElementById(\`home-bookmarks-\${tabId}\`);
           const bookmarks = await window.electronAPI.getBookmarks();
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
        }
        
        if (window.electronAPI.listNotes) {
          const grid = document.getElementById(\`notes-grid-\${tabId}\`);
          try {
            let notes = await window.electronAPI.listNotes();
            notes.sort((a, b) => b.updated - a.updated);
            
            if (notes.length > 0) {
              const latest = notes[0];
              const contSection = document.getElementById(\`home-continue-\${tabId}\`);
              const contCard = document.getElementById(\`continue-card-\${tabId}\`);
              contSection.style.display = 'block';
              
              let title = latest.title || latest.id;
              let typeIcon = latest.type === 'pdf' ? '📄' : latest.type === 'blank' ? '📓' : '🌐';
              
              contCard.innerHTML = \`<div style="font-size: 24px; margin-right: 16px;">\${typeIcon}</div>
                                    <div style="flex: 1; overflow: hidden;">
                                      <div style="font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #333;">\${title}</div>
                                      <div style="font-size: 12px; color: #666; margin-top: 4px;">Updated \${new Date(latest.updated).toLocaleDateString()}</div>
                                    </div>\`;
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
                 thumbContainer.innerHTML = \`<span style="font-size: 40px; opacity: 0.5;">\${typeIcon}</span>\`;
              }
              
              const infoContainer = document.createElement('div');
              infoContainer.style.cssText = 'padding: 12px;';
              infoContainer.innerHTML = \`
                <div style="font-weight: 500; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 4px; color: #333;">\${title}</div>
                <div style="font-size: 12px; color: #5f6368; display: flex; justify-content: space-between;">
                   <span>\${new Date(note.updated).toLocaleDateString()}</span>
                   <span>\${note.strokeCount} strokes</span>
                </div>
              \`;
              
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
        }
      }
    }, 0);
