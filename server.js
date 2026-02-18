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

// Load all accounts dynamically from .env
const accounts = [];
let i = 1;
while (process.env[`API_ID_${i}`] && process.env[`API_HASH_${i}`] && process.env[`SESSION_${i}`]) {
    accounts.push({
        name: `Account ${i}`,
        apiId: Number(process.env[`API_ID_${i}`]),
        apiHash: process.env[`API_HASH_${i}`],
        session: process.env[`SESSION_${i}`]
    });
    i++;
}

const clients = [];
let clientsReady = false;

async function startClients() {
    for (const acc of accounts) {
        const client = new TelegramClient(new StringSession(acc.session), acc.apiId, acc.apiHash, { connectionRetries: 5 });
        try {
            await client.start({
                phoneNumber: async () => '',
                password: async () => '',
                phoneCode: async () => '',
                onError: console.log
            });
            clients.push({ name: acc.name, client });
            console.log(`Telegram Client Started: ${acc.name}`);
        } catch (err) {
            console.error(`Failed to start client ${acc.name}:`, err.message);
        }
    }
    clientsReady = true;
}

startClients();

// Serve index.html
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// API: List Accounts
app.get('/api/accounts', (req, res) => {
    if (!clientsReady) return res.json([]);
    const list = clients.map((c, i) => ({ index: i, name: c.name }));
    res.json(list);
});

// API: List Groups
app.get('/api/groups/:accountIndex', async (req, res) => {
    const idx = Number(req.params.accountIndex);
    if (!clients[idx]) return res.json({ success: false, message: 'Account not found' });

    const client = clients[idx].client;

    try {
        const dialogs = await client.getDialogs({ limit: 1000 });
        const groups = (dialogs || [])
            .filter(d => d && (d.isGroup || d.isChannel))
            .map(g => ({ id: g.id, title: g.title || "No title", username: g.username || "" }));
        res.json({ success: true, groups });
    } catch (err) {
        console.error(err);
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
        let sourceEntity, destEntity;

        // Source
        try {
            if (sourceLink.includes('joinchat')) {
                const hash = sourceLink.split('/').pop();
                const invite = await client.invoke(new Api.messages.CheckChatInvite({ hash }));
                users = invite.users || [];
            } else {
                sourceEntity = await client.getEntity(sourceLink);
                users = await client.getParticipants(sourceEntity);
            }
        } catch (err) {
            return res.json({ success: false, message: 'Cannot find source group: ' + err.message });
        }

        // Destination
        try {
            if (destinationLink.includes('joinchat')) {
                const hash = destinationLink.split('/').pop();
                destEntity = await client.invoke(new Api.messages.CheckChatInvite({ hash }));
                destEntity = destEntity.chat || destEntity;
            } else {
                destEntity = await client.getEntity(destinationLink);
            }
        } catch (err) {
            return res.json({ success: false, message: 'Cannot find destination group: ' + err.message });
        }

        // Add members
        let successCount = 0, failCount = 0;
        for (const user of users) {
            try {
                await client.addChatUser(destEntity, user.id, { fwdLimit: 0 });
                successCount++;
            } catch {
                failCount++;
            }
            await new Promise(r => setTimeout(r, wait));
        }

        res.json({ success: true, message: `Added: ${successCount}, Failed: ${failCount}` });

    } catch (err) {
        console.error(err);
        res.json({ success: false, message: err.message });
    }
});

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
