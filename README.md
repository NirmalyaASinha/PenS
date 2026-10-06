<div align="center">
  <img src="LOGO.png" alt="PenS Logo" width="128" height="128">
  <h1>PenS</h1>
  <p><strong>A Digital Notebook & Browser Hybrid Built for Pen Computing</strong></p>
  <p>Browse the web, read PDFs, take ink notes directly on content, and keep everything in unified notebooks.</p>
</div>

---

## 📖 Overview

**PenS** is an Electron-based browser, PDF reader, and digital notebook tailored for stylus and pen tablet workflows on Windows. It bridges the gap between active reading and note-taking by allowing users to draw and write directly on live webpages and PDF documents, while keeping ink notes synchronized and persistent across profiles.

### ✨ Key Features

- **🖊️ Seamless Digital Inking**:
  - Pressure-sensitive pen input, highlighters, and stroke-aware vector erasers.
  - Automatic pen/mouse mode detection with seamless input switching.
  - Floating and draggable pen palette with customizable stroke colors and sizes.
  - Ink overlays saved automatically per URL and PDF file without modifying source pages.

- **🌐 Modern Browsing & Tabs**:
  - Multi-tabbed web browsing with back/forward/reload navigation and zoom controls.
  - Built-in bookmarks bar and browsing history.
  - Snapshot to PDF: capture the current webpage as an annotated PDF document with one click.

- **📑 Native PDF Reader**:
  - Integrated PDF viewer built with PDF.js and PDF-lib.
  - Write and annotate directly on PDF pages with full undo/redo history.

- **👤 Multi-Profile & Privacy**:
  - Isolated browsing profiles (Default, Work, Personal, Guest mode) with custom colors and avatars.
  - Independent cookies, cache, notes, bookmarks, and downloads per profile.
  - One-click profile export (`.penprofile`) and data purging.

- **🔒 Password Vault**:
  - Local vault encrypted with AES-256-GCM and system-level `safeStorage` protection.
  - Exact-origin domain matching for secure autofill.

- **🛡️ Built on Security-First Foundations**:
  - `contextIsolation: true`, `sandbox: true`, and `nodeIntegration: false` enforced across all renderers and webviews.
  - Fine-grained IPC handlers with schema validation using [Zod](https://github.com/colinhacks/zod).
  - Custom `pens://` internal protocol restricted to local application assets with strict Content Security Policy (CSP).
  - Atomic file writes for note data to prevent corruption on unexpected shutdowns.

---

## 📂 Project Structure

```text
PenS/
├── main/                       # Main process (Node.js / Electron)
│   ├── main.js                 # Application lifecycle, windows, secure IPC & protocol setup
│   ├── preload.js              # Secure contextBridge API for the PenS shell
│   ├── profileManager.js       # Profile management and path resolution
│   ├── store.js                # Ink notes storage, URL normalization, index management
│   ├── bookmarksManager.js     # Per-profile bookmarks storage
│   ├── historyManager.js       # Per-profile visit history
│   ├── passwordsManager.js     # Encrypted password vault (AES-256-GCM / safeStorage)
│   ├── downloadsManager.js     # Download item management
│   ├── settingsManager.js      # Per-profile settings
│   ├── syncManager.js          # Profile export and backup utilities
│   └── utils.js                # Filename sanitization, atomic writes, safe JSON loaders
├── renderer/                   # Trusted shell UI (HTML / CSS / JS)
│   ├── index.html              # Main application frame (titlebar, toolbar, content area)
│   ├── index.css               # Design system, layout, and UI styling
│   ├── renderer.js             # Shell controller, tab management, Home and Notes views
│   ├── ink-engine.js           # Vector stroke rendering, canvas engine, pressure handling
│   ├── pdf-viewer.js           # PDF rendering and page annotation wrapper
│   ├── pdf-init.js             # PDF.js module initialization
│   └── web-view-preload.js     # Minimal, isolated preload for webview tabs (ink overlay)
├── afterPack.js                # Post-packaging script to configure Electron Fuses
├── package.json                # Dependencies, scripts, and electron-builder build config
├── LOGO.png                    # Application branding icon
└── README.md                   # Project documentation
```

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v20 or later recommended)
- Windows 10/11 (with pen/stylus support recommended for inking features)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/NirmalyaASinha/PenS.git
   cd PenS
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

### Running in Development

Start the application:
```bash
npm start
```

---

## 📦 Packaging & Building

To generate Windows binaries (NSIS installer and portable executable):

```bash
npm run dist
```

Packaged outputs will be placed in the `dist/` folder:
- **NSIS Installer**: `dist/pens Setup 1.0.0.exe`
- **Portable Executable**: `dist/pens 1.0.0.exe`
- **Unpacked Folder**: `dist/win-unpacked/pens.exe`

Electron Fuses are automatically configured via `afterPack.js` to disable `RunAsNode`, enforce ASAR integrity, and prevent unauthorized Node execution in production builds.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| <kbd>Ctrl</kbd> + <kbd>T</kbd> | Open New Tab |
| <kbd>Ctrl</kbd> + <kbd>W</kbd> | Close Active Tab |
| <kbd>Ctrl</kbd> + <kbd>H</kbd> | Open Browsing History |
| <kbd>Ctrl</kbd> + <kbd>L</kbd> | Focus Address Bar |
| <kbd>Ctrl</kbd> + <kbd>+</kbd> / <kbd>-</kbd> | Zoom In / Out |
| <kbd>Ctrl</kbd> + <kbd>0</kbd> | Reset Zoom |
| <kbd>Ctrl</kbd> + <kbd>Z</kbd> | Undo Ink Stroke |
| <kbd>Ctrl</kbd> + <kbd>Y</kbd> | Redo Ink Stroke |
| <kbd>P</kbd> | Cycle Input Modes (Auto / Pen Lock / Browse Lock) |
| <kbd>B</kbd> | Switch to Pen Tool |
| <kbd>H</kbd> | Switch to Highlighter Tool |
| <kbd>E</kbd> | Switch to Eraser Tool |
| <kbd>[</kbd> / <kbd>]</kbd> | Decrease / Increase Pen Stroke Size |

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
