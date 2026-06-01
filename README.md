# 🔗 Linkage

**Linkage** is a lightweight and fast application for seamless clipboard synchronization and real-time file transfers between your computer and mobile device.

![Linkage Preview](https://raw.githubusercontent.com/your-username/linkage/main/preview.gif)

## ✨ Features

- 📋 **Instant Clipboard Sync**: Copy text on your PC — it immediately appears on your phone, and vice-versa.
- 📁 **File Transfer**: Quickly send files from phone to PC and back without cables or cloud services.
- ⌨️ **Remote Input**: Use your phone as a wireless keyboard for your computer.
- 🚀 **Ultra Lightweight**: Consumes only ~45MB of RAM thanks to Rust and native system engines.
- 🔐 **Privacy First**: All data is transmitted only within your local network. No third-party servers involved.

## 🛠 Tech Stack

- **Desktop**: [Tauri](https://tauri.app/) (Rust + React + TypeScript)
- **Mobile Web**: React + TailwindCSS + Socket.io
- **Backend**: Rust (Axum) + Socketioxide

## 🚀 Quick Start (Development)

### Prerequisites
- Node.js and Rust installed (for building from source).
- Both devices must be on the same Wi-Fi network.

### Setup
1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/linkage.git
   cd linkage
   ```
2. Install dependencies and run:
   ```bash
   cd linkage-desktop
   npm install
   npm run tauri dev
   ```

## 📦 Download Release
You can download the ready-to-use installer from the **[Releases](https://github.com/your-username/linkage/releases)** section. 
1. Download `Linkage_x64_en-US.msi` or `.exe`.
2. Run the installer.
3. Launch Linkage from your desktop or start menu.

## 📖 How to Use
1. Launch the app on your PC.
2. Go to the **Connection** tab.
3. Scan the QR code with your phone camera or enter the URL in your mobile browser.
4. Enter the 4-digit PIN displayed on your PC screen.
5. Done! Your devices are now linked.

---

## 🔒 Security & Architecture

### Dynamic Ports
If port `3000` is occupied by another app, Linkage automatically finds an available port in the `3000-3010` range, preventing conflicts.

### Local Network
Linkage works on a P2P principle within your local network. Your files and texts never leave your router.

## 📄 License
MIT License. Free to use and modify.
