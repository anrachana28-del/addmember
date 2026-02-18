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
      client: null,
      username: '-', // will fetch
      phone: '-', // optional
    });
  }
}

// Connect all clients
(async()=>{
  for(let c of clients){
    try{
      const client = new TelegramClient(new StringSession(c.session), c.apiId, c.apiHash, { connectionRetries:5 });
      await client.connect();
      c.client = client;

      // fetch me
      const me = await client.getMe();
      c.username = me.username || '-';
      c.phone = me.phone || '-';
      c.status = 'online';
      console.log(`${c.name} connected`);
    }catch(err){
      c.status = 'error';
      console.log(`${c.name} error: ${err.message}`);
    }
  }
})();

// Serve frontend
app.get('/', (req,res)=>{
  res.sendFile(path.join(__dirname,'index.html'));
});

// Accounts admin page data
app.get('/accounts', (req,res)=>{
  res.json(clients.map(c=>({
    name: c.name,
    username: c.username,
    phone: c.phone,
    status: c.status
  })));
});

// List groups page data
app.get('/groups', async (req,res)=>{
  let allGroups = [];
  for(let c of clients){
    if(!c.client) continue;
    try{
      const dialogs = await c.client.getDialogs({});
      const groups = dialogs.filter(d=>d.isGroup).map(g=>{
        return {
          title: g.name,
          id: g.id.toString(),
          username: g.username || '-',
          role: g.adminRights ? "Admin" : "Member"
        }
      });
      allGroups = allGroups.concat(groups);
    }catch(e){}
  }
  res.json(allGroups);
});

// SSE: add members with delay + batch
app.get('/add-members-stream', async (req,res)=>{
  const { source, target } = req.query;
  res.set({
    'Content-Type':'text/event-stream',
    'Cache-Control':'no-cache',
    'Connection':'keep-alive'
  });
  res.flushHeaders();

  stopFlag = false;

  const members = [
    {username:"user1"}, {username:"user2"}, {username:"user3"}, {username:"user4"}
  ]; // sample list
  let added = 0;

  outer:
  for(let clientObj of clients){
    const client = clientObj.client;
    if(!client) continue;

    for(let member of members){
      if(stopFlag) break outer;
      added++;
      const percent = Math.floor((added/members.length)*100);

      // Simulate success/failure
      let success = Math.random()>0.2; // 80% success
      // TODO: replace with real Telegram add-member logic
      // await client.addMember(targetGroupId, memberId);

      res.write(`data: ${JSON.stringify({
        member: member.username,
        status: success?"ជោគជ័យ":"បរាជ័យ",
        account: clientObj.username,
        source,
        target,
        percent
      })}\n\n`);

      // delay 40s per member
      await new Promise(r=>setTimeout(r,40000));
    }
  }

  res.write(`data: ${JSON.stringify({member:"-", status:"បានបញ្ចប់!", account:"-", source, target, percent:100})}\n\n`);
  res.end();
});

// Stop endpoint
app.get('/stop',(req,res)=>{
  stopFlag = true;
  res.send("Stopped");
});

app.listen(PORT, ()=>console.log(`Server running http://localhost:${PORT}`));
