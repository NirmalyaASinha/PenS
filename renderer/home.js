const fs = require('fs');
const path = require('path');

async function initHome(contentArea) {
  try {
    const homeHtml = fs.readFileSync(path.join(__dirname, 'home.html'), 'utf8');
    contentArea.innerHTML = homeHtml;
    
    // Bind events
    const seeAllBtn = document.getElementById('home-see-all-notes');
    if (seeAllBtn) {
      seeAllBtn.addEventListener('click', (e) => {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('navigate-notes'));
      });
    }
  } catch(e) {
    console.error('Failed to load home view', e);
  }
}

module.exports = { initHome };
