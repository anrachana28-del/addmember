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

// Telegram Client
const apiId1 = Number(process.env.API_ID_1);
const apiHash1 = process.env.API_HASH_1;
const session1 = process.env.SESSION_1;

const client1 = new TelegramClient(new StringSession(session1), apiId1, apiHash1, { connectionRetries: 5 });

async function startClient() {
    await client1.start({
        phoneNumber: async () => '',
        password: async () => '',
        phoneCode: async () => '',
        onError: (err) => console.log(err),
    });
    console.log('Telegram Client Started');
}

startClient();

// Serve index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Add members API (support public & private source groups)
app.post('/addMember', async (req, res) => {
    const { sourceLink, destinationLink, delay } = req.body;
    const wait = delay || 5000;

    try {
        let sourceEntity;
        let users = [];

        // Detect private vs public
        if (sourceLink.includes('joinchat')) {
            // Private invite link
            try {
                const invite = await client1.invoke(
                    new Api.messages.CheckChatInvite({ hash: sourceLink.split('/').pop() })
                );
                users = invite.users || [];
            } catch (err) {
                if (err.message.includes("INVITE_HASH_EXPIRED")) {
                    return res.json({ success: false, message: "Source link expired or invalid!" });
                }
                throw err;
            }
        } else {
            // Public group link
            sourceEntity = await client1.getEntity(sourceLink);
            users = await client1.getParticipants(sourceEntity);
        }

        const dest = await client1.getEntity(destinationLink);

        let success = 0, failed = 0;

        for (const user of users) {
            try {
                await client1.addChatUser(dest, user.id, { fwdLimit: 0 });
                success++;
            } catch (err) {
                failed++;
            }
            await new Promise(r => setTimeout(r, wait));
        }

        res.json({ success: true, message: `Added: ${success}, Failed: ${failed}` });

    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
