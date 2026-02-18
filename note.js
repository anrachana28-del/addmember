require('dotenv').config();
const express = require('express');
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

let clients = [];
let stopFlag = false;

// Load accounts from .env
for(let i=1;i<=5;i++){
  if(process.env[`API_ID_${i}`]){
    clients.push({
      name: `Account ${i}`,
      apiId: Number(process.env[`API_ID_${i}`]),
      apiHash: process.env[`API_HASH_${i}`],
      session: process.env[`SESSION_${i}`],
      status: 'offline',
      client: null
    });
  }
}

// Connect all accounts
(async()=>{
  for(let c of clients){
    try{
      const client = new TelegramClient(new StringSession(c.session), c.apiId, c.apiHash, { connectionRetries:5 });
      await client.connect();
      c.client = client;
      c.status = 'online';
      console.log(`${c.name} connected`);
    }catch(err){
      c.status = 'error';
      console.log(`${c.name} error: ${err.message}`);
    }
  }
})();

// Serve HTML
app.get('/', (req,res)=>{
  res.sendFile(path.join(__dirname,'index.html'));
});

// Return account status
app.get('/accounts',(req,res)=>{
  res.json(clients.map(a=>({name:a.name,status:a.status})));
});

// SSE: Add members with delay and batch
app.get('/add-members-stream', async (req,res)=>{
  const { source, target } = req.query;
  res.set({
    'Content-Type':'text/event-stream',
    'Cache-Control':'no-cache',
    'Connection':'keep-alive'
  });
  res.flushHeaders();

  stopFlag = false;

  const membersToAdd = 20; // example total members
  let added = 0;

  outer:
  for(let clientObj of clients){
    const client = clientObj.client;
    if(!client) continue;

    // batch of 10 members/account
    for(let i=0;i<Math.min(10,membersToAdd-added);i++){
      if(stopFlag) break outer;

      added++;
      const percent = Math.floor((added/membersToAdd)*100);

      // TODO: replace with actual Telegram add member logic
      // await client.addMember(target, memberId);

      res.write(`data: ${JSON.stringify({message:`${clientObj.name} បន្ថែម member ${added}`, percent})}\n\n`);

      // Delay 40 seconds
      await new Promise(r => setTimeout(r,40000));

      if(added >= membersToAdd) break outer;
    }
  }

  res.write(`data: ${JSON.stringify({message:"បានបញ្ចប់!", percent:100})}\n\n`);
  res.end();
});

// Stop endpoint
app.get('/stop', (req,res)=>{
  stopFlag = true;
  res.send("Stopped");
});

app.listen(PORT,()=>console.log(`Server running on http://localhost:${PORT}`));
