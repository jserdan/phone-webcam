# 📱 Phone-to-OBS WebRTC Cam

Turn your Android phone into a high-quality, ultra-low latency webcam for **OBS Studio** over your local Wi-Fi / LAN network — **without installing any apps** on your phone.

Built with native WebRTC, WebSocket signaling, and HTML5 APIs (Camera Stream, Torch, Screen Wake Lock).

---

## ✨ Features

- **No App Installation Needed**: Uses Android Chrome's native camera and WebRTC capabilities.
- **Ultra-Low Latency**: P2P WebRTC connection over local network (typically <100ms latency).
- **OBS Browser Source Ready**: Clean, full-bleed video page ready to drop directly into OBS Studio.
- **OBS Virtual Camera**: Stream from OBS directly to Zoom, Discord, Google Meet, Teams, Skype, etc.
- **Full Camera Controls on Phone**:
  - 🔄 Flip between back camera and front selfie camera
  - ⚙️ Resolution toggle (1080p, 720p low-latency default, 480p ultra-fast)
  - ⚡ Frame rate selector (30 FPS or 60 FPS)
  - 🔦 Flashlight / Torch toggle
  - 🔋 Screen Wake Lock (keeps the screen awake during streaming)
- **Local Pairing Dashboard**: PC control hub with live stream preview and instant QR Code pairing.

---

## 🛠️ Architecture

```
[ Android Chrome ]  --- (WebRTC Media Stream: Video) --->  [ OBS Studio Browser Source ]
        |                                                              |
        +--- (WebSocket Signaling) <---> [ Local Node.js Server ] <----+
```

- **HTTPS Server (Port 8443)**: Serves camera client to Android Chrome (browsers require HTTPS to grant camera hardware access on network hosts).
- **HTTP Server (Port 8000)**: Serves the OBS Browser Source and PC Dashboard (running over HTTP prevents SSL warnings inside OBS).
- **WebSocket Server**: Relays SDP offers, answers, and ICE candidates between phone and PC.

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v16 or higher)
- [OBS Studio](https://obsproject.com/) installed on your PC
- Android phone with Chrome browser connected to the **same Wi-Fi / Local Network**

---

### Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/jserdan/phone-webcam.git
   cd phone-webcam
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the server:**
   ```bash
   node server.js
   ```

---

## 📖 Step-by-Step Usage

### Step 1: Open the PC Dashboard
In your PC browser, open:
👉 **[http://localhost:8000/index.html](http://localhost:8000/index.html)**

This page displays:
- The pairing **QR Code**
- The Android direct connection link
- The OBS browser source link
- A **live stream monitor**

---

### Step 2: Connect Your Android Phone

1. Make sure your phone is connected to the same Wi-Fi as your PC.
2. Scan the QR code with your phone camera, or manually open the displayed link in Chrome:
   ```text
   https://<YOUR_PC_LAN_IP>:8443/camera.html
   ```
   *(Example: `https://192.168.1.8:8443/camera.html`)*
3. **Handle Local SSL Warning:**
   Because the local SSL certificate is self-signed:
   - Tap **Advanced**
   - Tap **Proceed to (unsafe)**
4. Tap **"Enable Camera"** and grant camera permissions when prompted.
5. Your camera feed will immediately stream to your PC!

---

### Step 3: Add to OBS Studio

1. Open **OBS Studio**.
2. In the **Sources** dock, click the **`+`** icon and select **Browser**.
3. Name the source (e.g., `Phone Camera`).
4. Configure the Browser Source settings:
   - **URL:** `http://localhost:8000/obs.html`
   - **Width:** `1920` (or `1280`)
   - **Height:** `1080` (or `720`)
   - Check **"Shutdown source when not visible"**
5. Click **OK**. The stream from your phone will now appear in your OBS scene.

---

### Step 4: Output to Zoom, Discord, or Teams (Virtual Camera)

1. In OBS Studio, look at the **Controls** dock on the bottom right.
2. Click **Start Virtual Camera**.
3. Open your video meeting app (Zoom, Google Meet, Microsoft Teams, Discord, etc.).
4. Select **OBS Virtual Camera** as your webcam device.

---

## 🔧 Windows Firewall Note

If your phone gives a `Connection Timed Out` error when loading the link, Windows Defender Firewall may be blocking local connections.

Run this command once in **PowerShell (Run as Administrator)**:
```powershell
New-NetFirewallRule -DisplayName "Phone-Webcam-Streaming" -Direction Inbound -LocalPort 8000,8443 -Protocol TCP -Action Allow
```

---

## 📁 Project Structure

```
phone-webcam/
├── certs/               # Auto-generated self-signed SSL certificates (ignored in git)
├── public/
│   ├── index.html       # PC setup hub with QR code and live stream preview
│   ├── camera.html      # Mobile camera capture page with WebRTC sender
│   └── obs.html         # Clean OBS Studio browser source receiver
├── package.json
├── README.md
└── server.js            # Node.js HTTPS/HTTP & WebRTC signaling server
```

---

## 📄 License

MIT License. Free to use, modify, and distribute.
