require("dotenv").config();
const express = require("express");
const path = require("path");
const cors = require("cors");
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");

const app = express();
app.use(express.json());
app.use(cors());

// Serve static files from root
app.use(express.static(__dirname));

// Serve index.html at root
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

const PORT = process.env.PORT || 3000;

let clients = {};
let stats = { success: 0, fail: 0 };
let isRunning = false;
let interval;

// Load accounts from .env (supports up to 10 accounts)
for (let i = 1; i <= 10; i++) {
  const apiId = process.env[`API_ID_${i}`];
  const apiHash = process.env[`API_HASH_${i}`];
  const session = process.env[`SESSION_${i}`];
  if (apiId && apiHash && session) {
    const client = new TelegramClient(
      new StringSession(session),
      parseInt(apiId),
      apiHash,
      { connectionRetries: 5 }
    );
    clients[`account${i}`] = client;
  }
}

// Routes
app.get("/accounts", (req, res) => res.json(Object.keys(clients)));

app.post("/export-members", async (req, res) => {
  const { account, group } = req.body;
  const client = clients[account];
  if (!client) return res.json({ success: false, error: "Account not found" });

  try {
    await client.connect();
    const participants = await client.getParticipants(group);
    const ids = participants.map(p => p.username || p.id);
    res.json({ success: true, ids });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.post("/start", async (req, res) => {
  const { group, usernames, accounts } = req.body;
  if (!accounts || accounts.length === 0)
    return res.json({ message: "No accounts selected" });
  if (isRunning) return res.json({ message: "Already running" });

  isRunning = true;
  stats = { success: 0, fail: 0 };
  let userIndex = 0;
  let currentAccountIndex = 0;

  interval = setInterval(async () => {
    if (!isRunning || userIndex >= usernames.length) {
      clearInterval(interval);
      isRunning = false;
      return;
    }

    const accountName = accounts[currentAccountIndex];
    const client = clients[accountName];

    try {
      await client.connect();
      await client.invoke({
        _: "channels.inviteToChannel",
        channel: group,
        users: [usernames[userIndex]]
      });
      console.log(`✅ ${accountName} added ${usernames[userIndex]}`);
      stats.success++;
      userIndex++;
    } catch (err) {
      if (err.message.includes("FLOOD_WAIT")) {
        console.log(`⚠ Flood on ${accountName}`);
        currentAccountIndex++;
        if (currentAccountIndex >= accounts.length) {
          clearInterval(interval);
          isRunning = false;
        }
      } else {
        console.log(`❌ Failed ${usernames[userIndex]} (${err.message})`);
        stats.fail++;
        userIndex++;
      }
    }
  }, 40000); // 40 sec interval to avoid flood

  res.json({ message: "Started with selected accounts" });
});

app.post("/stop", (req, res) => {
  isRunning = false;
  clearInterval(interval);
  res.json({ message: "Stopped" });
});

app.post("/restart", (req, res) => {
  isRunning = false;
  clearInterval(interval);
  stats = { success: 0, fail: 0 };
  res.json({ message: "Restarted" });
});

app.get("/stats", (req, res) => res.json(stats));

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
