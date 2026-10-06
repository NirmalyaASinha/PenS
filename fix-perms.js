const fs = require('fs');
let code = fs.readFileSync('main/main.js', 'utf8');

const replacement = `
  const sitePermissions = new Map(); // Store as \`\${profileId}:\${origin}:\${permission}\`

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

    const key = \`\${profileId}:\${requestingOrigin}:\${permission}\`;
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
      message: \`The site \${requestingOrigin} is requesting permission for: \${permission}\`
    });

    const granted = response === 1;
    sitePermissions.set(key, granted);
    callback(granted);
  });

  profileSession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    const key = \`\${profileId}:\${requestingOrigin}:\${permission}\`;
    return sitePermissions.get(key) === true;
  });
`;

code = code.replace(/profileSession\.setPermissionRequestHandler\(\(webContents, permission, callback\) => \{[\s\S]*?callback\(false\);\s*\}\s*\}\);/, replacement.trim());
fs.writeFileSync('main/main.js', code, 'utf8');
