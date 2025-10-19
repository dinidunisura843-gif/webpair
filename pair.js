const express = require('express');
const fs = require('fs');
const path = require('path');
const { exec } = require("child_process");
const pino = require("pino");
const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers,
    jidNormalizedUser
} = require("@whiskeysockets/baileys");
const { upload } = require('./mega');

const router = express.Router();

// 🧹 Helper: delete files/folders safely
function removeFile(FilePath) {
    if (fs.existsSync(FilePath)) {
        fs.rmSync(FilePath, { recursive: true, force: true });
    }
}

// 🧠 Helper: generate random MEGA file IDs
function randomMegaId(length = 6, numberLength = 4) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    const number = Math.floor(Math.random() * Math.pow(10, numberLength));
    return `${result}${number}`;
}

// 🚀 Main route
router.get('/', async (req, res) => {
    let num = req.query.number;

    if (!num) {
        return res.status(400).json({ error: "Missing ?number= parameter" });
    }

    num = num.replace(/[^0-9]/g, '');

    const sessionPath = path.join(__dirname, 'sessions', num);
    if (!fs.existsSync(path.dirname(sessionPath))) {
        fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
    }

    async function startPairing() {
        try {
            const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

            const sock = makeWASocket({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
                },
                printQRInTerminal: false,
                logger: pino({ level: "fatal" }),
                browser: Browsers.macOS("Safari"),
            });

            // Step 1: Request pairing code
            if (!sock.authState.creds.registered) {
                await delay(1500);
                const code = await sock.requestPairingCode(num);
                if (!res.headersSent) {
                    res.status(200).json({
                        number: num,
                        pairing_code: code,
                        status: "waiting_for_pairing"
                    });
                }
            }

            sock.ev.on('creds.update', saveCreds);

            // Step 2: Connection handling
            sock.ev.on("connection.update", async (update) => {
                const { connection, lastDisconnect } = update;

                if (connection === "open") {
                    try {
                        console.log(`✅ ${num} paired successfully!`);
                        await delay(8000);

                        const credsFile = path.join(sessionPath, 'creds.json');
                        if (!fs.existsSync(credsFile)) return;

                        const mega_url = await upload(
                            fs.createReadStream(credsFile),
                            `${randomMegaId()}.json`
                        );

                        const session_id = mega_url.replace('https://mega.nz/file/', '');
                        const user_jid = jidNormalizedUser(sock.user.id);

                        // Send session ID to the linked WhatsApp
                        await sock.sendMessage(user_jid, {
                            text: `✅ Your session ID:\n${session_id}`
                        });

                        console.log(`🧾 Session ID for ${num}: ${session_id}`);

                        // Cleanup
                        removeFile(sessionPath);

                        // Optional: respond via HTTP if not already sent
                        if (!res.headersSent) {
                            res.status(200).json({
                                number: num,
                                session_id,
                                status: "uploaded"
                            });
                        }

                        sock.end();
                    } catch (err) {
                        console.error("Upload/Send error:", err);
                        exec('pm2 restart danuwa');
                    }
                }

                // Auto-reconnect for non-auth errors
                else if (connection === "close" && lastDisconnect &&
                         lastDisconnect.error &&
                         lastDisconnect.error.output?.statusCode !== 401) {
                    console.log(`⚠️ Reconnecting for ${num}...`);
                    await delay(5000);
                    startPairing();
                }
            });

        } catch (err) {
            console.error("❌ Pairing error:", err);
            removeFile(sessionPath);

            if (!res.headersSent) {
                res.status(500).json({ error: "Service unavailable" });
            }

            exec('pm2 restart danuwa-md');
        }
    }

    await startPairing();
});

// Global crash handler
process.on('uncaughtException', (err) => {
    console.log('Caught exception:', err);
    exec('pm2 restart danuwa');
});

module.exports = router;
