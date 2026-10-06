const fs = require('fs');
let pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

pkg.build = {
  "appId": "com.pens.app",
  "afterPack": "./afterPack.js",
  "asar": true,
  "files": [
    "**/*",
    "!**/*.map",
    "!**/*.ts",
    "!**/*.md",
    "!tests/**/*",
    "!scratch/**/*",
    "!.github/**/*",
    "!security-test.html",
    "!*.js",
    "main/**/*.js",
    "renderer/**/*",
    "afterPack.js",
    "node_modules/**/*"
  ],
  "win": {
    "target": ["nsis", "portable"],
    "publisherName": "Your Name Here",
    "certificateSubjectName": "Your Name Here"
  },
  "nsis": {
    "oneClick": false,
    "perMachine": false,
    "allowToChangeInstallationDirectory": true,
    "deleteAppDataOnUninstall": false
  },
  "publish": {
    "provider": "github"
  }
};

fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2), 'utf8');

