require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { Api } = require('telegram');

const app = express();
const PORT = process.env.PORT || 3000;

// JSON parsing
app.use(express.json());

// File upload
const upload = multer({ dest: 'uploads/' });

// ===== Telegram Accounts =====
let clients = [];

// Load accounts from .env
for (let i=1; i<=5; i++){
  if(process.env[`API_ID_${i}`]){
    clients.push({
      name: `Account ${i}`,
      apiId: Number(process.env[`API_ID_${i}`]),
      apiHash: process.env[`API_HASH_${i}`],
      session: process.env[`SESSION_${i}`],
      client: null,
      username: '-',
      status: 'offline'
    });
  }
}

// Connect Telegram clients
(async ()=>{
  for(let c of clients){
    try{
      const client = new TelegramClient(
        new StringSession(c.session),
        c.apiId,
        c.apiHash,
        { connectionRetries: 5 }
      );
      await client.connect();
      const me = await client.getMe();
      c.client = client;
      c.username = me.username || '-';
      c.status = 'online';
      console.log(`${c.name} connected`);
    } catch(err){
      c.status = 'error';
      console.log(`${c.name} failed`);
    }
  }
})();

// ===== Serve index.html =====
app.get('/', (req,res)=>{
  res.sendFile(path.join(__dirname,'index.html'));
});

// ===== Routes =====

// Accounts
app.get('/accounts', (req,res)=>{
  res.json(clients.map(c=>({
    name:c.name,
    username:c.username,
    status:c.status
  })));
});

// Groups
app.get('/groups', async (req,res)=>{
  let allGroups=[];
  for(let c of clients){
    if(!c.client) continue;
    try{
      const dialogs = await c.client.getDialogs();
      dialogs.filter(d=>d.isGroup).forEach(g=>{
        allGroups.push({
          title:g.name,
          id:g.id.toString(),
          username:g.username || '-'
        });
      });
    }catch{}
  }
  res.json(allGroups);
});

// Generate Invite Link
app.get('/generate-link', async (req,res)=>{
  const { groupId } = req.query;
  const client = clients.find(c=>c.client)?.client;
  if(!client) return res.json({error:"No client online"});
  try{
    const result = await client.invoke(
      new Api.messages.ExportChatInvite({ peer: groupId })
    );
    res.json({ link: result.link });
  } catch(err){
    res.json({ error: err.message });
  }
});

// Export Members CSV
app.get('/export-members', async (req,res)=>{
  const { groupId } = req.query;
  const client = clients.find(c=>c.client)?.client;
  if(!client) return res.send("No client online");

  try{
    const participants = await client.getParticipants(groupId);
    let csv = "username,id\n";
    participants.forEach(p=>{
      csv += `${p.username || ''},${p.id}\n`;
    });
    const filePath = path.join(__dirname,'members.csv');
    fs.writeFileSync(filePath,csv);
    res.download(filePath,'members.csv',err=>{
      if(err) console.error(err);
      fs.unlinkSync(filePath);
    });
  } catch(err){
    res.send("Error exporting members");
  }
});

// ===== Process Groups (Mock) =====
app.post('/process-groups', (req,res)=>{
  const { source, target } = req.body;
  res.json({ message:`Processing from ${source} to ${target}` });
});

// ===== Upload Excel (Preview Only) =====
app.post('/upload', upload.single('file'), (req,res)=>{
  if(!req.file) return res.status(400).json({error:"No file uploaded"});
  res.json({ filename: req.file.originalname });
});

// ===== Start Server =====
app.listen(PORT, ()=>console.log(`Server running at http://localhost:${PORT}`));
