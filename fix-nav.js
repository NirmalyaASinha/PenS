const fs = require('fs');
let code = fs.readFileSync('renderer/renderer.js', 'utf8');
code = code.replace(
  /function navigateTo\(url\) \{\s*const tab = getActiveTab\(\);\s*if \(!tab\) return;\s*if \(!url\.startsWith\('http:\/\/'\) && !url\.startsWith\('https:\/\/'\) && !url\.startsWith\('file:\/\/'\) && url !== 'pens:\/\/home'\) url = 'https:\/\/' \+ url;/,
  `function navigateTo(url) {
  const tab = getActiveTab();
  if (!tab) return;
  if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('file://') && !url.startsWith('pens://')) url = 'https://' + url;
  
  if (url.startsWith('http://') && !url.startsWith('http://localhost') && !url.startsWith('http://127.0.0.1')) {
    if (!confirm('Warning: This site uses unencrypted HTTP which is insecure. Do you still want to proceed?')) {
      return;
    }
  }`
);
fs.writeFileSync('renderer/renderer.js', code, 'utf8');
