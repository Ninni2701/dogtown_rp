const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

let players = {};
let groundItems = {
    'item_1': { id: 'item_1', x: 250, y: 250, name: 'Eurodollar-Bündel', icon: '💶', type: 'Cash' },
    'item_2': { id: 'item_2', x: 500, y: 150, name: 'Nicola (Dose)', icon: '🥤', type: 'Consumable' },
    'item_3': { id: 'item_3', x: 350, y: 400, name: 'Altes Cyberdeck', icon: '💾', type: 'Tech' }
};

io.on('connection', (socket) => {
    socket.on('joinGame', (data) => {
        players[socket.id] = {
            x: 100,
            y: 100,
            id: socket.id,
            name: data.name,
            color: Math.random() * 0xffffff,
            inventory: [
                { id: 'start_1', name: "MaxDoc Mk.1", type: "Heal", icon: "💊" },
                { id: 'start_2', name: "Unity (Pistole)", type: "Weapon", icon: "🔫" }
            ]
        };
        socket.emit('currentPlayers', players);
        socket.emit('currentItems', groundItems);
        socket.broadcast.emit('newPlayer', players[socket.id]);
    });

    socket.on('pickupItem', (itemId) => {
        if (groundItems[itemId] && players[socket.id]) {
            const pickedItem = groundItems[itemId];
            players[socket.id].inventory.push(pickedItem);
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

// WICHTIG: process.env.PORT ist für den Online-Hoster!
const PORT = process.env.PORT || 3000;
http.listen(PORT, '0.0.0.0', () => {
    console.log(`Dogtown-Server läuft online auf Port ${PORT}`);
});