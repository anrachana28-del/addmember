require('dotenv').config();
const express = require('express');
const path = require('path');
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const input = require('input');

const app = express();
app.use(express.json());

// Serve index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Config
const batchSize = 10;        // 10 users per batch
const minDelay = 10000;       // 4s minimum per user
const maxDelay = 10000;       // 8s maximum per user

// Load multi-account from .env
const accounts = [];
for (let i = 1; i <= 5; i++) {
  if (process.env[`API_ID_${i}`]) {
    accounts.push({
      apiId: Number(process.env[`API_ID_${i}`]),
      apiHash: process.env[`API_HASH_${i}`],
      session: process.env[`SESSION_${i}`],
      client: null
    });
  }
}

// Utility: random delay
function randomDelay(min, max) {
  const ms = Math.floor(Math.random() * (max - min) + min);
  return new Promise(r => setTimeout(r, ms));
}

// Initialize all clients
(async () => {
  for (const acc of accounts) {
    const client = new TelegramClient(new StringSession(acc.session), acc.apiId, acc.apiHash, { connectionRetries: 5 });
    await client.connect();
    acc.client = client;
    console.log(`Account ${acc.apiId} connected`);
  }
})();

// SSE endpoint: live batch progress
app.get('/add-members-stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');

  const sourceGroup = req.query.source;
  const targetGroup = req.query.target;

  let totalMembers = 0;
  let addedCount = 0;

  async function send(message) {
    const percent = totalMembers === 0 ? 0 : Math.floor((addedCount / totalMembers) * 100);
    res.write(`data: ${JSON.stringify({ message, percent })}\n\n`);
  }

  try {
    // Use first account to fetch members
    const mainClient = accounts[0].client;
    const sourceEntity = await mainClient.getEntity(sourceGroup);
    const members = await mainClient.getParticipants(sourceEntity);
    totalMembers = members.filter(m => m.username).length;

    const targetEntity = await mainClient.getEntity(targetGroup);

    // Split members into batches
    for (let i = 0; i < members.length; i += batchSize) {
      const batch = members.slice(i, i + batchSize);
      const client = accounts[(i / batchSize) % accounts.length].client;

      await send(`Starting batch ${Math.floor(i/batchSize)+1} (${batch.length} members)`);

      for (const member of batch) {
        try {
          if (!member.username) {
            await send(`Skipping private user ${member.id}`);
            continue;
          }

          await client.addUser(targetEntity, member, { fwdLimit: 0 });
          addedCount++;
          await send(`Added: ${member.username}`);

          // Random delay between minDelay and maxDelay
          await randomDelay(minDelay, maxDelay);

        } catch (err) {
          await send(`Failed: ${member.username || member.id} -> ${err.message}`);
        }
      }

      // Optional delay between batches
      if (i + batchSize < members.length) {
        await send(`Waiting before next batch...`);
        await randomDelay(minDelay, maxDelay);
      }
    }

    await send("✅ All batches processed!");
    res.end();

  } catch (err) {
    await send("❌ Error: " + err.message);
    res.end();
  }
});

// Render port
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

