# कलम

कलम is a Windows Electron workspace that combines a browser, PDF reader,
digital notebook, and pen/ink annotation tools.

## Features

- Tabbed web browsing with bookmarks, history, profiles, privacy controls, and
  browser zoom.
- PDF reading with fast nearby-page rendering, zoom, text comments, ink,
  highlighter, undo/redo, export, and a Performance mode.
- A floating pen palette with colors, stroke size, opacity, pen,
  highlighter, and eraser tools.
- Per-profile notes, bookmarks, downloads, settings, avatars, and themes.
- Home News and Jobs & internships feeds with saved topic filters.
- A Focus view for expanded feed results, filtering, saving, and refreshing.
- Profile locking with PIN/password credentials, automatic lock triggers,
  lockout delays, recovery keys, and protected sensitive actions.
- Encrypted password storage and exact-origin autofill.

## Download for Windows

The repository includes the current release executables through Git LFS:

- `dist/कलम-Setup-1.0.0-rc.1.exe` - installer
- `dist/कलम-Portable-1.0.0-rc.1.exe` - portable version

The build is currently unsigned. Windows SmartScreen may therefore show an
unverified-publisher warning.

## Development

### Requirements

- Windows 10 or Windows 11
- Node.js 20 or later
- Git LFS for the checked-in release executables

### Run locally

```powershell
git lfs install
git clone https://github.com/NirmalyaASinha/PenS.git
cd PenS
npm install
npm start
```

### Build Windows packages

```powershell
npm run build
```

The build creates the NSIS installer, portable executable, unpacked app, and
SHA-256 checksums in `dist/`. The generated folder is ignored by default;
only release executables explicitly tracked with Git LFS are committed.

### Verify the release files

```powershell
Get-FileHash dist\कलम-Setup-1.0.0-rc.1.exe -Algorithm SHA256
Get-FileHash dist\कलम-Portable-1.0.0-rc.1.exe -Algorithm SHA256
Get-Content dist\SHA256SUMS.txt
```

## Important paths

```text
main/                  Electron main process, IPC, profiles, storage, lock
renderer/              Trusted shell UI, browser tabs, PDF viewer, ink tools
scripts/build.js       Windows packaging and checksum generation
LOGO.png               Source application logo
LOGO.ico               Windows application icon
PROGRESS.md            Development and verification history
```

User data is stored outside the repository under the Windows Documents
directory. Do not commit real profile data, credentials, notes, or lock-state
files.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl+T` | New tab |
| `Ctrl+W` | Close active tab |
| `Ctrl+H` | Browsing history |
| `Ctrl+L` | Focus address bar |
| `Ctrl++` / `Ctrl+-` | Zoom in/out |
| `Ctrl+0` | Reset zoom |
| `Ctrl+Shift+L` | Lock the active profile |
| `Ctrl+Z` / `Ctrl+Y` | Undo/redo ink |
| `P` | Cycle input modes |
| `B` | Pen |
| `H` | Highlighter |
| `E` | Eraser |

## Security notes

Internal pages use a restricted `pens://` protocol, context isolation,
disabled Node integration, validated IPC arguments, and a strict content
boundary for web pages. Passwords use the existing encrypted vault; lock
credentials are never stored as plaintext.

## License

This project is licensed under the [MIT License](LICENSE).
