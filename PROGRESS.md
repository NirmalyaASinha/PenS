# PenS progress

Updated: 2026-10-07

## Completed

- Fixed blank Home and PDF loading.
- Added PDF zoom, comments, ink annotations, persistence, and export flows.
- Added profile creation, profile switching, profile identity, avatar, color, and exact-origin autofill settings.
- Added browser-style overflow and profile menus.
- Added aligned, scrollable Settings with Appearance, Privacy, Data & backup, Passwords, About, and profile identity sections.
- Kept profile-only identity controls out of Downloads.
- Added a draggable, persistent floating ink palette with pinning and opacity control.
- Added topic-based Home News and Jobs & Internships feeds with saved per-profile topics and automatic loading.
- Applied `LOGO.png` to the packaged app icon, window icon, and renderer favicon.
- Added the persisted two-state main-process lock foundation (`Unlocked`/`Locked`), central locked-profile IPC guard, and temporary renderer test commands (`electronAPI.lockProfile()` / `electronAPI.unlockProfile()`).
- Added main-process PIN/password credentials with scrypt verifiers, random salts, constant-time checks, persisted escalating failed-attempt delays, and credential change/removal checks.
- Added a trusted internal lock window, toolbar lock button, Ctrl+Shift+L shortcut, hidden profile windows during lock, and credential-verified restoration on unlock.
- Added profile automatic-lock settings for idle timeout, minimize, Windows lock/sleep, and app startup, with main-process activity protection for typing and drawing.
- Rebuilt the unsigned RC installer and portable artifact after the latest changes.

## Current release status

- Version: `1.0.0-rc.1`
- Electron: `33.4.11`
- electron-builder: `25.1.8`
- App ID: `com.nirmalyasinha.pens`
- Latest commit: `2d2d280`
- Build artifacts are unsigned because no Authenticode certificate is configured.

## Remaining release blockers

- Complete profile/browser lock flow: credentials, lock screen, unlock, recovery, lockout, triggers, window hiding, and protected actions.
- Windows Hello integration and encrypted-at-rest profile migration.
- Full security, migration, importer, packaged E2E, upgrade, uninstall, performance, accessibility, and compatibility verification.
- Authenticode signing and signature verification.
- Updater implementation and signed update testing.

## Verification convention

Only commands actually run are reported as `[RAN]`; observed installed-build behavior is `[OBSERVED]`; source inspection is `[CODE-READ]`. A production-ready verdict requires the remaining blockers and clean-environment tests to pass.
