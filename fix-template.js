const fs = require('fs');
let code = fs.readFileSync('main/main.js', 'utf8');
code = code.replace(/const key = `:`;/, 'const key = `${profileId}:${channel}`;');
code = code.replace(/console\.error\(\`IPC Validation Error on :\`, err\.message\);/, 'console.error(`IPC Validation Error on ${channel}:`, err.message);');
fs.writeFileSync('main/main.js', code, 'utf8');
