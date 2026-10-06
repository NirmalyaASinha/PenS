console.log(require('electron'));
const { app } = require('electron');
console.log('App is:', typeof app);
if (app) app.quit();
process.exit(0);
