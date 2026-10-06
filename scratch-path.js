const { app } = require('electron');
app.whenReady().then(() => {
  console.log('DOCUMENTS:', app.getPath('documents'));
  app.quit();
});
