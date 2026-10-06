const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer, WebSocket } = require('ws');
const selfsigned = require('selfsigned');
const QRCode = require('qrcode');

const HTTPS_PORT = 8443;
const HTTP_PORT = 8000;

// Find local IPv4 address
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    let fallback = '127.0.0.1';
    for (const name of Object.keys(interfaces)) {
        // Skip virtual or vEthernet adapters if possible
        if (/vEthernet|Tailscale|WSL|VirtualBox|VMware/i.test(name)) continue;
        for (const net of interfaces[name]) {
            if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('169.254')) {
                return net.address;
            }
        }
    }
    // If none matched, check everything non-internal
    for (const name of Object.keys(interfaces)) {
        for (const net of interfaces[name]) {
            if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('169.254')) {
                return net.address;
            }
        }
    }
    return fallback;
}

const localIP = getLocalIP();

// Generate or load self-signed certificate for HTTPS
const certDir = path.join(__dirname, 'certs');
const keyPath = path.join(certDir, 'key.pem');
const certPath = path.join(certDir, 'cert.pem');

if (!fs.existsSync(certDir)) {
    fs.mkdirSync(certDir, { recursive: true });
}

async function initCert() {
    if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
        return {
            key: fs.readFileSync(keyPath),
            cert: fs.readFileSync(certPath)
        };
    } else {
        console.log('[Cert] Generating self-signed SSL certificate for local LAN...');
        const attrs = [{ name: 'commonName', value: localIP }];
        const pems = await selfsigned.generate(attrs, { days: 365, keySize: 2048 });
        fs.writeFileSync(keyPath, pems.private);
        fs.writeFileSync(certPath, pems.cert);
        return {
            key: pems.private,
            cert: pems.cert
        };
    }
}

// Static file server handler
function serveStatic(req, res) {
    let filePath = path.join(__dirname, 'public', req.url.split('?')[0]);
    if (req.url === '/' || req.url === '') {
        filePath = path.join(__dirname, 'public', 'index.html');
    }

    const extname = path.extname(filePath).toLowerCase();
    const mimeTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpg',
        '.svg': 'image/svg+xml'
    };

    const contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('404 Not Found');
            } else {
                res.writeHead(500);
                res.end(`Server Error: ${error.code}`);
            }
        } else {
            res.writeHead(200, {
                'Content-Type': contentType,
                'Cache-Control': 'no-store'
            });
            res.end(content, 'utf-8');
        }
    });
}

async function start() {
    const { key, cert } = await initCert();

    // 1. HTTPS Server (For Android Phone camera capture + WebRTC sender)
    const httpsServer = https.createServer({ key, cert }, serveStatic);

    // 2. HTTP Server (For PC OBS Browser Source - fast and no self-signed warning in OBS)
    const httpServer = http.createServer(serveStatic);

    // WebSocket Signaling Server attached to both HTTPS and HTTP
    const wss = new WebSocketServer({ noServer: true });

    let senderWs = null;
    const receiverClients = new Set();

    httpsServer.on('upgrade', (request, socket, head) => {
        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request);
        });
    });

    httpServer.on('upgrade', (request, socket, head) => {
        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request);
        });
    });

    wss.on('connection', (ws) => {
        let role = null;

        ws.on('message', (message) => {
            try {
                const data = JSON.parse(message);
                
                if (data.type === 'register') {
                    role = data.role; // 'sender' (phone) or 'receiver' (OBS/PC)
                    if (role === 'sender') {
                        senderWs = ws;
                        console.log('[WS] Phone (Sender) registered.');
                        for (const client of receiverClients) {
                            if (client.readyState === WebSocket.OPEN) {
                                client.send(JSON.stringify({ type: 'sender_ready' }));
                            }
                        }
                    } else if (role === 'receiver') {
                        receiverClients.add(ws);
                        console.log(`[WS] PC Receiver registered (Total: ${receiverClients.size}).`);
                        if (senderWs && senderWs.readyState === WebSocket.OPEN) {
                            ws.send(JSON.stringify({ type: 'sender_ready' }));
                        }
                    }
                } else if (role === 'sender') {
                    for (const client of receiverClients) {
                        if (client.readyState === WebSocket.OPEN) {
                            client.send(message.toString());
                        }
                    }
                } else if (role === 'receiver') {
                    if (senderWs && senderWs.readyState === WebSocket.OPEN) {
                        senderWs.send(message.toString());
                    }
                }
            } catch (err) {
                console.error('[WS Error]', err);
            }
        });

        ws.on('close', () => {
            if (role === 'sender') {
                console.log('[WS] Phone (Sender) disconnected.');
                senderWs = null;
                for (const client of receiverClients) {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'sender_disconnected' }));
                    }
                }
            } else if (role === 'receiver') {
                receiverClients.delete(ws);
                console.log(`[WS] PC Receiver disconnected. (Remaining: ${receiverClients.size})`);
            }
        });
    });

    // Start Servers
    httpsServer.listen(HTTPS_PORT, '0.0.0.0', async () => {
        httpServer.listen(HTTP_PORT, '0.0.0.0', async () => {
            const phoneUrl = `https://${localIP}:${HTTPS_PORT}/camera.html`;
            const obsUrl = `http://localhost:${HTTP_PORT}/obs.html`;
            const dashboardUrl = `http://localhost:${HTTP_PORT}/index.html`;

            console.log('\n===============================================================');
            console.log('🎥 PHONE WEBCAM -> OBS WEBRTC STREAM SERVER STARTED');
            console.log('===============================================================');
            console.log(`\n1. [PC Dashboard]:       ${dashboardUrl}`);
            console.log(`2. [OBS Browser Source]: ${obsUrl}`);
            console.log(`3. [Phone Camera]:       ${phoneUrl}\n`);

            try {
                const qrAscii = await QRCode.toString(phoneUrl, { type: 'terminal', small: true });
                console.log('Scan this QR code with your Android Camera / Chrome:');
                console.log(qrAscii);
            } catch (e) {
                console.error('Failed to generate terminal QR code:', e);
            }
            console.log('===============================================================\n');
        });
    });
}

start().catch(console.error);
