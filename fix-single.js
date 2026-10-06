const fs = require('fs');
let code = fs.readFileSync('main/main.js', 'utf8');

const singleInstanceLogic = `
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
`;

code = code.replace(/app\.enableSandbox\(\);/, `app.enableSandbox();\n${singleInstanceLogic}`);
fs.writeFileSync('main/main.js', code, 'utf8');
