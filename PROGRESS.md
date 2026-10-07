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
- Added locked-window content protection, neutral titles, and notification permission suppression while profiles are locked.
- Fixed the lock-state tampering bypass with a safeStorage-protected HMAC integrity envelope and fail-closed verification.
- Added one-time recovery keys (stored as salted digests), two-minute main-process reauthentication, and guards for password reveal, profile export/deletion, and lock changes.
- Renamed the user-facing project and packaged application to कलम while retaining the stable internal app ID and pens:// protocol.
- Added an explicit Windows ICO generated from LOGO.png so packaged executable and shortcut icons cannot fall back to Electron's atom icon.
- Restored the active Home news and jobs feed loader so feed panels no longer remain stuck on Loading.
- Fixed lock IPC calls using the removed `lockManager.status()` API; all lock state checks now use `getState()`, and credential verification is exposed on `LockManager`.
- Improved PDF performance with nearby-page virtualization, cancellable visible-page rendering, transform-based zoom feedback, capped raster scale, visible text layers, packaged PDF.js worker resolution, and a persisted Performance mode.
- Confirmed no GPU-disabling command-line flags are configured; the main process logs Electron GPU feature status at startup for machine-specific reporting.
- Clarified Snap behavior: it now gives a direct message outside web pages, validates the selected webview belongs to the active profile, and logs complete Chromium GPU information when available.
- Corrected Home layout overrides so bookmarks and the adjacent Home content keep a consistent 40/60 alignment at smaller window widths.
- Prevented repeated password reauthentication errors on Settings load; password lists now stay locked until the user explicitly reauthenticates, and final Home CSS overrides prevent legacy rules from changing pane alignment.
- Added a Focus button beside Home feed Refresh that opens a dedicated Focus tab with expanded News and Jobs & internships results, saved topic filters, and refresh controls.
- Updated Home greetings to use the active कलम profile name instead of the Windows account name, and fixed Home search text and placeholder contrast in dark theme.
- Added a profile-saved Home background image picker with remove/reset control, and improved dark-theme Home card contrast.
- Fixed the live Home Focus button binding; it now opens the dedicated Focus tab instead of relying on the inactive legacy loader.
- Compacted the Home news panel into bounded two-column lists and added a visible, persisted topic filter with Save filter and reload controls.
- Updated README and release documentation for current कलम features and artifacts; large Windows executables are tracked with Git LFS because GitHub rejects ordinary blobs over 100 MB.
- Enabled usable profile-lock controls in Settings for creating, changing, and removing a PIN/password, with one-time recovery-key display; Windows Hello remains explicitly unavailable until native integration exists.
- Replaced the About placeholder notice with a feature overview covering browsing, PDF markup, ink, organization, protection, and feeds.
- Rebuilt the unsigned RC installer and portable artifact after the latest changes.

## Current release status

- Version: `1.0.0-rc.1`
- Electron: `33.4.11`
- electron-builder: `25.1.8`
- App ID: `com.nirmalyasinha.pens`
- Latest commit: pending
- Build artifacts are unsigned because no Authenticode certificate is configured.

## Remaining release blockers

- Complete profile/browser lock flow: credentials, lock screen, unlock, recovery, lockout, triggers, window hiding, and protected actions.
- Windows Hello integration and encrypted-at-rest profile migration.
- Full security, migration, importer, packaged E2E, upgrade, uninstall, performance, accessibility, and compatibility verification.
- Authenticode signing and signature verification.
- Updater implementation and signed update testing.
- Windows may retain already-delivered notification toasts until their normal OS timeout; Electron does not provide a supported API to retract those existing notifications.

## Verification convention

Only commands actually run are reported as `[RAN]`; observed installed-build behavior is `[OBSERVED]`; source inspection is `[CODE-READ]`. A production-ready verdict requires the remaining blockers and clean-environment tests to pass.
