const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses');
const path = require('path');

exports.default = async function(context) {
  const ext = process.platform === 'win32' ? '.exe' : '';
  const electronExecutableFileName = context.packager.executableName + ext;
  const electronExecutablePath = path.join(context.appOutDir, electronExecutableFileName);

  console.log('Flipping Electron Fuses for:', electronExecutablePath);

  await flipFuses(electronExecutablePath, {
    version: FuseVersion.V1,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableCookieEncryption]: true,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
    [FuseV1Options.GrantFileProtocolExtraPrivileges]: false
  });
};

