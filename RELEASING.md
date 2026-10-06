# Releasing PenS

## Local dry release

1. Update `version` in `package.json` and add release notes to `CHANGELOG.md`.
2. Run `npm install` if dependencies changed.
3. Run `npm run release:dry`.
4. Verify `dist\PenS-Setup-<version>.exe`, `dist\PenS-Portable-<version>.exe`,
   `dist\PenS-Setup-<version>.exe.blockmap`, `dist\latest.yml`, and
   `dist\SHA256SUMS.txt`.

The build is unsigned unless `CSC_LINK` is configured. The build script
disables executable signing only when no signing certificate is configured, so
a configured certificate remains usable for release builds.

## GitHub release

After testing the dry build, commit the version and changelog, create the tag
`v<version>`, and run `npm run release` with GitHub publishing credentials
available to electron-builder. Upload the installer, blockmap, portable
executable (if distributing it), `latest.yml`, and `SHA256SUMS.txt`. Never put
tokens in source code.

Installers upgrade in place because the app ID and NSIS GUID stay fixed. The
uninstaller keeps `Documents\PenNotebook` by default.
