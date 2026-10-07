const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const distDir = path.join(root, 'dist');
const builder = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'electron-builder.cmd' : 'electron-builder');
const hasSigningConfiguration = Boolean(process.env.CSC_LINK || process.env.WIN_CSC_LINK);
const args = process.argv.slice(2);
if (!hasSigningConfiguration) args.push('--config.win.signAndEditExecutable=false');
const publishing = args.includes('--publish') || args.includes('-p');
if (publishing && !hasSigningConfiguration) {
  throw new Error('Publishing a release requires CSC_LINK or WIN_CSC_LINK for Authenticode signing.');
}
if (publishing) args.push('--config.forceCodeSigning=true');

if (fs.existsSync(distDir)) {
  for (const name of fs.readdirSync(distDir)) {
    if (/^(?:.+-(?:Setup|Portable)-.+\.exe(?:\.blockmap)?|latest\.yml|builder-debug\.yml|SHA256SUMS\.txt|SBOM\.cdx\.json)$/i.test(name)) {
      fs.rmSync(path.join(distDir, name), { force: true });
    }
  }
}

const command = process.platform === 'win32'
  ? [process.env.ComSpec || 'cmd.exe', ['/d', '/c', 'call', builder, ...args]]
  : [builder, args];
const result = spawnSync(command[0], command[1], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
  windowsHide: false
});

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);

const sbomPath = path.join(distDir, 'SBOM.cdx.json');
const sbomCommand = process.platform === 'win32'
  ? [process.env.ComSpec || 'cmd.exe', ['/d', '/c', 'npm.cmd', 'sbom', '--sbom-format', 'cyclonedx', '--package-lock-only']]
  : ['npm', ['sbom', '--sbom-format', 'cyclonedx', '--package-lock-only']];
const sbom = spawnSync(sbomCommand[0], sbomCommand[1], {
  cwd: root,
  encoding: 'utf8',
  env: process.env,
  windowsHide: true
});
if (sbom.status !== 0) {
  process.stderr.write(sbom.stderr || 'Unable to generate SBOM.\n');
  process.exit(sbom.status || 1);
}
fs.writeFileSync(sbomPath, sbom.stdout);

const releaseFiles = fs.readdirSync(distDir)
  .filter((name) => /^(.*-(Setup|Portable)-.+\.exe|.*-Setup-.+\.exe\.blockmap|latest\.yml|SBOM\.cdx\.json)$/i.test(name))
  .sort();

const checksums = releaseFiles.map((name) => {
  const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(distDir, name))).digest('hex');
  return `${hash}  ${name}`;
});

fs.writeFileSync(path.join(distDir, 'SHA256SUMS.txt'), `${checksums.join('\n')}\n`);
console.log(`Wrote SHA256SUMS.txt for ${releaseFiles.length} release files.`);
