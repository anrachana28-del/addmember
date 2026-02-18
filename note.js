require('dotenv').config(); // load .env
const express = require('express');
const path = require('path');
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { Api } = require('telegram');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

// Load credentials from .env
const apiId1 = Number(process.env.API_ID_1);
const apiHash1 = process.env.API_HASH_1;
const session1 = process.env.SESSION_1; // string session

// Initialize Telegram client
const client1 = new TelegramClient(new StringSession(session1), apiId1, apiHash1, {
    connectionRetries: 5,
});

async function startClient() {
    await client1.start({
        // Since we already have a session, login is not required
        phoneNumber: async () => '', 
        password: async () => '',
        phoneCode: async () => '',
        onError: (err) => console.log(err),
    });
    console.log('Telegram Client 1 Started');
}

startClient();

// Serve index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Add members API
app.post('/addMember', async (req, res) => {
    const { sourceLink, destinationLink, delay } = req.body;

    try {
        // Get source group info
        const source = await client1.invoke(
            new Api.messages.CheckChatInvite({ hash: sourceLink.split('/').pop() })
        );

        const users = source.users || [];
        console.log('Users to add:', users.length);

        const dest = await client1.getEntity(destinationLink);

        let success = 0, failed = 0;
        for (const user of users) {
            try {
                await client1.addChatUser(dest, user.id, { fwdLimit: 0 });
                success++;
            } catch (err) {
                console.log('Failed to add:', user.username || user.id, err.message);
                failed++;
            }
            await new Promise(r => setTimeout(r, delay || 5000)); // default 5 sec
        }

        res.json({ success: true, message: `Added: ${success}, Failed: ${failed}` });

    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
