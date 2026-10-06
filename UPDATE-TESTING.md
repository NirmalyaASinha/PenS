# Update testing

Test packaged builds, not only `npm start`. In a clean Windows user profile:

1. Install the older NSIS build and create notes, bookmarks, profiles, and
   settings.
2. Install the newer NSIS build without uninstalling the older one.
3. Confirm the installation directory, one Start Menu entry, one Apps entry,
   the displayed version, and all user data.
4. Reinstall the same version and confirm data remains intact.
5. Uninstall with the default option and confirm `Documents\PenNotebook`
   remains available after reinstall.

Portable builds are independent copies and do not provide in-place installer
upgrades. Current release artifacts are unsigned unless a certificate is
configured; signature and SmartScreen checks are therefore blocked until a
Windows code-signing certificate is supplied.
