const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(packageJson.version)) {
  throw new Error(`Invalid semantic version: ${packageJson.version}`);
}
if (packageJson.build.appId !== 'com.nirmalyasinha.pens') {
  throw new Error('The permanent appId must remain com.nirmalyasinha.pens.');
}
if (packageJson.build.nsis.guid !== 'E8F3C92B-4A71-4E1D-9B67-94751A2E8B99') {
  throw new Error('The permanent NSIS GUID must not change.');
}

const publish = process.argv.includes('--publish');
if (publish && !process.env.GH_TOKEN) {
  throw new Error('Publishing requires GH_TOKEN in the environment.');
}
if (publish && !process.env.CSC_LINK && !process.env.WIN_CSC_LINK) {
  throw new Error('Publishing requires CSC_LINK or WIN_CSC_LINK for Authenticode signing.');
}
const args = [path.join(__dirname, 'build.js')];
if (publish) args.push('--publish', 'always');
const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit', env: process.env });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);

console.log(`${publish ? 'Release' : 'Dry release'} ${packageJson.version} built successfully.`);
