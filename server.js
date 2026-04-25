const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

let players = {};

// Loot auf dem Boden
let groundItems = {
    'item_1': { id: 'item_1', x: 150, y: 250, name: 'Eurodollar-Bündel', icon: '💶', type: 'Cash' },
    'item_2': { id: 'item_2', x: 500, y: 400, name: 'Nicola (Dose)', icon: '🥤', type: 'Consumable' },
    'item_3': { id: 'item_3', x: 900, y: 600, name: 'Altes Cyberdeck', icon: '💾', type: 'Tech' }
};

// Unsere NPCs in Dogtown / Night City
let npcs = {
    'npc_1': { id: 'npc_1', x: 300, y: 400, name: 'Jackie Welles', icon: '🕴️', dialog: 'Hey, Choomba! Gut geschlafen? Wir haben heute einen dicken Gig vor uns. Hast du deine Kanone dabei?' },
    'npc_2': { id: 'npc_2', x: 1000, y: 700, name: 'Viktor (Ripperdoc)', icon: '🦾', dialog: 'Setz dich auf den Stuhl. Lass mich einen Blick auf deine Kiroshi-Optik werfen... hm, ein paar Kratzer, aber läuft.' }
};

io.on('connection', (socket) => {
    socket.on('joinGame', (data) => {
        // Spieler startet jetzt IN SEINEM APARTMENT (x:150, y:150)
        players[socket.id] = {
            x: 150, y: 150, id: socket.id, name: data.name,
            color: Math.random() * 0xffffff,
            inventory: [
                { id: 'start_1', name: "MaxDoc Mk.1", type: "Heal", icon: "💊" },
                { id: 'start_2', name: "Unity (Pistole)", type: "Weapon", icon: "🔫" }
            ]
        };
        socket.emit('currentPlayers', players);
        socket.emit('currentItems', groundItems);
        socket.emit('currentNPCs', npcs); // Schicke NPCs an den Client
        socket.broadcast.emit('newPlayer', players[socket.id]);
    });

    socket.on('chatMessage', (msg) => {
        if (players[socket.id]) {
            io.emit('newMessage', { name: players[socket.id].name, text: msg });
        }
    });

    socket.on('pickupItem', (itemId) => {
        if (groundItems[itemId] && players[socket.id]) {
            players[socket.id].inventory.push(groundItems[itemId]);
            delete groundItems[itemId];
            io.emit('itemRemoved', itemId);
            socket.emit('updateInventory', players[socket.id].inventory);
        }
    });

    socket.on('playerMovement', (movementData) => {
        if (players[socket.id]) {
            players[socket.id].x = movementData.x;
            players[socket.id].y = movementData.y;
            socket.broadcast.emit('playerMoved', players[socket.id]);
        }
    });

    socket.on('disconnect', () => {
        if (players[socket.id]) {
            delete players[socket.id];
            io.emit('playerDisconnected', socket.id);
        }
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log('Server läuft auf Port ' + PORT);
});