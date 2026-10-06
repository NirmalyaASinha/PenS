const fs = require('fs');
let code = fs.readFileSync('renderer/renderer.js', 'utf8');
const replacement = fs.readFileSync('scratch/home-render.js', 'utf8');

const regex = /if \(url === 'pens:\/\/home'\) \{[\s\S]*?\} else if \(url === 'pens:\/\/history'\)/;
if (regex.test(code)) {
    code = code.replace(regex, "if (url === 'pens://home') {\n" + replacement + "\n  } else if (url === 'pens://history')");
    fs.writeFileSync('renderer/renderer.js', code, 'utf8');
    console.log("Replaced successfully!");
} else {
    console.log("Regex did not match!");
}
