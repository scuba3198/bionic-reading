# 🧠 Bionic Reading: Cyber-Optical Augmented Engine (v2.0.0)

Enhance your reading experience with this high-performance Chrome extension that applies "Bionic Reading" techniques to any website. It uses a sophisticated **"Cyber-Optical"** design system, an **Effect-TS** orchestration framework, and a **Rust WebAssembly (WASM)** processing core.

![Release Version](https://img.shields.io/badge/version-2.0.0-2dd4bf?style=for-the-badge)
![License](https://img.shields.io/badge/license-GPL--3.0-0f172a?style=for-the-badge)

## ✨ Features

- **🦀 Rust WebAssembly Core**: High-performance text tokenization and formatting compiled to low-level Wasm. It implements the exact **Typo1 algorithm from patent DE102017112916A1**.
- **🛡️ 100% CSP-Immune Architecture**: WebAssembly execution is offloaded to the extension's background service worker. This completely bypasses strict Content Security Policies (CSP) on secure sites like GitHub and Twitter.
- **✨ Stop-Words Bypass**: Bypasses formatting for common English/German stop words (`the`, `and`, `to`, `der`, `die`, `das`) to maintain a natural visual flow.
- **⌨️ Keyboard Shortcut (`Alt+B`)**: Toggle the bionic engine instantly from any page.
- **⚡ Reactive UI Synchronization**: The popup UI reactively syncs with storage changes (updating status labels, colors, and button states in real-time when the keyboard shortcut is pressed).
- **🔄 SPA & Dynamic Mutation Support**: Automatically processes new elements on dynamic pages using `MutationObserver` and batched text walker queues.
- **🌙 Cyber-Optical UI**: A premium, "Augmented Reality" inspired interface featuring Glassmorphic panels, blueprint borders, and IBM Plex Mono typography.

## 🛠️ Build and Development

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) (v18+) and [Rust/Cargo](https://www.rust-lang.org/) installed, along with [wasm-pack](https://rustwasm.github.io/wasm-pack/):
```bash
npm install -g wasm-pack
```

### Installation & Build
1. Clone this repository.
2. Install npm dependencies:
   ```bash
   npm install
   ```
3. Run the complete build pipeline (compiles WASM, inlines binary, bundles popup/worker/content scripts via Vite, and copies assets):
   ```bash
   npm run build
   ```

### Loading in Chrome
1. Open Chrome and navigate to `chrome://extensions/`.
2. Enable **"Developer mode"** in the top right corner.
3. Click **"Load unpacked"** and select the **`dist/`** directory inside the project root folder.

## 📖 Usage

1. Click the **Bionic Reading** icon in your browser toolbar or press **Alt+B** to toggle the bionic enhancement.
2. If the active page is an internal browser page (e.g. `chrome://`), the extension status changes to **RESTRICTED** to prevent injection errors.
3. On standard webpages, the text is automatically parsed, formatted, and displayed using bionic reading prefixes.

## 🎨 Design Philosophy

Inspired by "Augmented Intelligence" and "Cyber-Precision," the interface uses a dark-obsidian palette with vibrant teal accents. The blueprint-style borders and scanline textures reflect the "Bionic" nature of the tool—augmenting human biological reading patterns with digital precision.

## 🤝 Credits

Originally developed by [@aktoriukas](https://github.com/aktoriukas). This version is a comprehensive refactor featuring a new WebAssembly engine and design system.

## 👤 Author

**Mumukshu D.C.**

## 📄 License

This project is licensed under the [GNU GPL v3](LICENSE).

---

*Made with precision for the augmented mind.*
