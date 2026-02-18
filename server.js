require('dotenv').config();
const express = require('express');
const path = require('path');
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { Api } = require('telegram');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

// Load accounts
const accounts = [
    {
        name: "Account 1",
        apiId: Number(process.env.API_ID_1),
        apiHash: process.env.API_HASH_1,
        session: process.env.SESSION_1
    }
];

const clients = [];

async function startClients() {
    for (const acc of accounts) {
        const client = new TelegramClient(new StringSession(acc.session), acc.apiId, acc.apiHash, { connectionRetries: 5 });
        await client.start({ phoneNumber: async () => '', password: async () => '', phoneCode: async () => '', onError: console.log });
        clients.push({ name: acc.name, client });
        console.log(`Telegram Client Started: ${acc.name}`);
    }
}

startClients();

// Serve UI
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// API: List Accounts
app.get('/api/accounts', (req, res) => {
    const list = clients.map((c, i) => ({ index: i, name: c.name }));
    res.json(list);
});

// API: List Groups for account
app.get('/api/groups/:accountIndex', async (req, res) => {
    const idx = Number(req.params.accountIndex);
    if (!clients[idx]) return res.json({ success: false, message: 'Account not found' });
    const client = clients[idx].client;

    try {
        const dialogs = await client.getDialogs();
        const groups = dialogs
            .filter(d => d.isGroup || d.isChannel)
            .map(g => ({ id: g.id, title: g.title }));
        res.json({ success: true, groups });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

// API: Add Members
app.post('/api/addMember', async (req, res) => {
    const { accountIndex, sourceLink, destinationLink, delay } = req.body;
    const wait = delay || 5000;

    if (!clients[accountIndex]) return res.json({ success: false, message: 'Account not found' });
    const client = clients[accountIndex].client;

    try {
        let users = [];
        if (sourceLink.includes('joinchat')) {
            try {
                const invite = await client.invoke(new Api.messages.CheckChatInvite({ hash: sourceLink.split('/').pop() }));
                users = invite.users || [];
            } catch (err) {
                if (err.message.includes("INVITE_HASH_EXPIRED")) return res.json({ success: false, message: 'Source link expired' });
                throw err;
            }
        } else {
            const source = await client.getEntity(sourceLink);
            users = await client.getParticipants(source);
        }

        const dest = await client.getEntity(destinationLink);

        let success = 0, failed = 0;
        for (const user of users) {
            try {
                await client.addChatUser(dest, user.id, { fwdLimit: 0 });
                success++;
            } catch (err) {
                failed++;
            }
            await new Promise(r => setTimeout(r, wait));
        }

        res.json({ success: true, message: `Added: ${success}, Failed: ${failed}` });

    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
