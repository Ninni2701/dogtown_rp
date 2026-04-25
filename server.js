const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

let players = {};

// === CYBERPUNK 2077 STYLE STATS SYSTEM ===

// Base stats configuration
const BASE_STATS = {
    reflexes: { name: 'Reflexes', base: 3, description: 'Combat speed, aim, melee attacks' },
    body: { name: 'Body', base: 3, description: 'Health, melee damage, carry weight' },
    intelligence: { name: 'Intelligence', base: 3, description: 'Quickhacking, tech abilities' },
    technical: { name: 'Technical', base: 3, description: 'Crafting, engineering, item quality' },
    cool: { name: 'Cool', base: 3, description: 'Stealth, assassination, crit damage' }
};

// Skill categories tied to stats
const SKILL_CATEGORIES = {
    // Reflexes skills
    'assault': { stat: 'reflexes', name: 'Assault', description: 'Heavy weapons' },
    'handguns': { stat: 'reflexes', name: 'Handguns', description: 'Pistols & revolvers' },
    'blades': { stat: 'reflexes', name: 'Blades', description: 'Katanas & knives' },
    'brawling': { stat: 'reflexes', name: 'Brawling', description: 'Unarmed combat' },
    // Body skills
    'athletics': { stat: 'body', name: 'Athletics', description: 'Endurance & running' },
    'strength': { stat: 'body', name: 'Strength', description: 'Melee damage' },
    // Intelligence skills
    'quickhacking': { stat: 'intelligence', name: 'Quickhacking', description: 'Netrunning' },
    'engineering': { stat: 'intelligence', name: 'Engineering', description: 'Tech weapons' },
    // Technical skills
    'crafting': { stat: 'technical', name: 'Crafting', description: 'Item creation' },
    'tech': { stat: 'technical', name: 'Tech', description: 'Gadgets & drones' },
    // Cool skills
    'stealth': { stat: 'cool', name: 'Stealth', description: 'Silent movement' },
    'sniper': { stat: 'cool', name: 'Sniper', description: 'Long-range kills' }
};

// Perk definitions (simplified for now)
const PERK_TREES = {
    reflexes: [
        { id: 'ref_perk1', name: 'Keen Eye', desc: '+10% crit chance', cost: 1, reqStat: 4 },
        { id: 'ref_perk2', name: 'Lightning Reflexes', desc: '+15% attack speed', cost: 1, reqStat: 6 },
        { id: 'ref_perk3', name: 'Blade Dancer', desc: '+20% melee damage', cost: 1, reqStat: 8 }
    ],
    body: [
        { id: 'body_perk1', name: 'Iron Skin', desc: '+10% max HP', cost: 1, reqStat: 4 },
        { id: 'body_perk2', name: 'Heavy Hitter', desc: '+20% melee damage', cost: 1, reqStat: 6 },
        { id: 'body_perk3', name: 'Titan', desc: '+50% carry weight', cost: 1, reqStat: 8 }
    ],
    intelligence: [
        { id: 'int_perk1', name: 'Synapse', desc: '+1 RAM', cost: 1, reqStat: 4 },
        { id: 'int_perk2', name: 'Neural Link', desc: '+20% hack speed', cost: 1, reqStat: 6 },
        { id: 'int_perk3', name: 'Brain', desc: 'Access tier 2 hacks', cost: 1, reqStat: 8 }
    ],
    technical: [
        { id: 'tech_perk1', name: 'Tinkerer', desc: '+10% crafting speed', cost: 1, reqStat: 4 },
        { id: 'tech_perk2', name: 'Engineer', desc: '+20% item quality', cost: 1, reqStat: 6 },
        { id: 'tech_perk3', name: 'Techie', desc: 'Craft unique items', cost: 1, reqStat: 8 }
    ],
    cool: [
        { id: 'cool_perk1', name: 'Ghost', desc: '+10% stealth', cost: 1, reqStat: 4 },
        { id: 'cool_perk2', name: 'Assassin', desc: '+25% crit damage', cost: 1, reqStat: 6 },
        { id: 'cool_perk3', name: 'Legend', desc: 'Intimidate NPCs', cost: 1, reqStat: 8 }
    ]
};

// XP required per level (Street Cred)
const XP_PER_LEVEL = [0, 100, 250, 500, 800, 1200, 1700, 2300, 3000, 4000, 5500];

// Helper to calculate derived stats
function calculateDerivedStats(stats, skills) {
    const derived = {
        maxHp: 100 + (stats.body * 20),
        critChance: 5 + (stats.reflexes * 2),
        critDamage: 50 + (stats.cool * 5),
        carryWeight: 20 + (stats.body * 10),
        stealthBonus: stats.cool * 3,
        hackPower: stats.intelligence,
        craftQuality: stats.technical * 5
    };
    
    // Add skill bonuses
    Object.keys(skills).forEach(skill => {
        const skillLevel = skills[skill];
        if (skill === 'assault' || skill === 'handguns') derived.critChance += skillLevel;
        if (skill === 'blades' || skill === 'strength') derived.critDamage += skillLevel * 2;
        if (skill === 'athletics') derived.maxHp += skillLevel * 5;
        if (skill === 'stealth') derived.stealthBonus += skillLevel * 2;
    });
    
    return derived;
}

// Create initial player stats
function createPlayerStats() {
    const stats = {};
    Object.keys(BASE_STATS).forEach(stat => {
        stats[stat] = { ...BASE_STATS[stat], value: BASE_STATS[stat].base, xp: 0 };
    });
    
    const skills = {};
    Object.keys(SKILL_CATEGORIES).forEach(skill => {
        skills[skill] = { level: 1, xp: 0 };
    });
    
    return {
        stats,
        skills,
        perks: [],
        streetCred: 1,
        totalXp: 0,
        perkPoints: 0
    };
}

// Add XP to a stat or skill
function addXp(playerStats, type, category, amount) {
    if (type === 'stat') {
        playerStats.stats[category].xp += amount;
        // Check for stat level up
        const statXpNeeded = playerStats.stats[category].value * 100;
        if (playerStats.stats[category].xp >= statXpNeeded) {
            playerStats.stats[category].xp -= statXpNeeded;
            playerStats.stats[category].value++;
            return { type: 'statLevelUp', category, newValue: playerStats.stats[category].value };
        }
    } else if (type === 'skill') {
        playerStats.skills[category].xp += amount;
        // Check for skill level up
        const skillXpNeeded = playerStats.skills[category].level * 50;
        if (playerStats.skills[category].xp >= skillXpNeeded) {
            playerStats.skills[category].xp -= skillXpNeeded;
            playerStats.skills[category].level++;
            return { type: 'skillLevelUp', category, newLevel: playerStats.skills[category].level };
        }
    }
    return null;
}

// Add Street Cred XP
function addStreetCredXp(playerStats, amount) {
    playerStats.totalXp += amount;
    
    // Check for level up
    let newLevel = playerStats.streetCred;
    while (newLevel < XP_PER_LEVEL.length && playerStats.totalXp >= XP_PER_LEVEL[newLevel]) {
        newLevel++;
    }
    
    if (newLevel > playerStats.streetCred) {
        const perkPointsGained = newLevel - playerStats.streetCred;
        playerStats.perkPoints += perkPointsGained;
        playerStats.streetCred = newLevel;
        return { type: 'levelUp', newLevel, perkPoints: perkPointsGained };
    }
    return null;
}

// === END STATS SYSTEM ===

// Loot auf dem Boden
let groundItems = {
    'item_1': { id: 'item_1', x: 150, y: 250, name: 'Eurodollar-Bündel', icon: '💶', type: 'Cash' },
    'item_2': { id: 'item_2', x: 500, y: 400, name: 'Nicola (Dose)', icon: '🥤', type: 'Consumable' },
    'item_3': { id: 'item_3', x: 900, y: 600, name: 'Altes Cyberdeck', icon: '💾', type: 'Tech' },
    // Watson area items
    'item_4': { id: 'item_4', x: 450, y: 200, name: 'Ramensuppe', icon: '🍜', type: 'Consumable' },
    'item_5': { id: 'item_5', x: 650, y: 200, name: 'Kiroshi-Optik', icon: '👁️', type: 'Tech' },
    'item_6': { id: 'item_6', x: 800, y: 400, name: 'Energy Drink', icon: '⚡', type: 'Consumable' },
    'item_7': { id: 'item_7', x: 1100, y: 500, name: 'MedGel', icon: '🩹', type: 'Heal' },
    'item_8': { id: 'item_8', x: 1300, y: 600, name: 'Militech Coupon', icon: '🎫', type: 'Misc' }
};

// NPCs in Watson / Little China
let npcs = {
    'npc_1': { id: 'npc_1', x: 300, y: 400, name: 'Jackie Welles', icon: '🕴️', dialog: 'Hey, Choomba! Gut geschlafen? Wir haben heute einen dicken Gig vor uns. Hast du deine Kanone dabei?' },
    'npc_2': { id: 'npc_2', x: 1050, y: 500, name: 'Viktor (Ripperdoc)', icon: '🦾', dialog: 'Setz dich auf den Stuhl. Lass mich einen Blick auf deine Kiroshi-Optik werfen... hm, ein paar Kratzer, aber läuft.' },
    'npc_3': { id: 'npc_3', x: 450, y: 80, name: 'Tom', icon: '👨‍🍳', dialog: 'Welcome to Tom\'s Diner! Best noodles in Watson. You look like you need a feed, choom.' },
    'npc_4': { id: 'npc_4', x: 650, y: 150, name: 'Tanya (Cyberware)', icon: '💅', dialog: 'Looking for chrome? I got the best deals in Little China. Kiroshi, Mantis Blades, Sandevistan... name it.' },
    'npc_5': { id: 'npc_5', x: 320, y: 280, name: 'Mr. Frong', icon: '🤖', dialog: 'Vending Machine: "Nicola - 5€ | Quantum Coffee - 8€ | Synth-Milk - 3€""' }
};

io.on('connection', (socket) => {
    socket.on('joinGame', (data) => {
        // Create player stats
        const playerStats = createPlayerStats();
        
        // Spieler startet jetzt IN SEINEM APARTMENT (x:150, y:150)
        players[socket.id] = {
            x: 150, y: 150, id: socket.id, name: data.name,
            color: Math.random() * 0xffffff,
            inventory: [
                { id: 'start_1', name: "MaxDoc Mk.1", type: "Heal", icon: "💊" },
                { id: 'start_2', name: "Unity (Pistole)", type: "Weapon", icon: "🔫" }
            ],
            // Stats system
            stats: playerStats.stats,
            skills: playerStats.skills,
            perks: playerStats.perks,
            streetCred: playerStats.streetCred,
            totalXp: playerStats.totalXp,
            perkPoints: playerStats.perkPoints,
            derived: calculateDerivedStats(playerStats.stats, playerStats.skills)
        };
        
        socket.emit('currentPlayers', players);
        socket.emit('currentItems', groundItems);
        socket.emit('currentNPCs', npcs); // Schicke NPCs an den Client
        socket.emit('playerStats', players[socket.id]); // Send stats to new player
        socket.emit('perkTrees', PERK_TREES); // Send perk trees
        socket.broadcast.emit('newPlayer', players[socket.id]);
    });

    // Handle stat XP gain
    socket.on('gainStatXp', (data) => {
        if (players[socket.id]) {
            const result = addXp(players[socket.id], 'stat', data.stat, data.amount);
            players[socket.id].derived = calculateDerivedStats(players[socket.id].stats, players[socket.id].skills);
            socket.emit('playerStats', players[socket.id]);
            if (result) socket.emit('levelUp', result);
        }
    });

    // Handle skill XP gain
    socket.on('gainSkillXp', (data) => {
        if (players[socket.id]) {
            const result = addXp(players[socket.id], 'skill', data.skill, data.amount);
            players[socket.id].derived = calculateDerivedStats(players[socket.id].stats, players[socket.id].skills);
            socket.emit('playerStats', players[socket.id]);
            if (result) socket.emit('levelUp', result);
        }
    });

    // Handle Street Cred XP gain
    socket.on('gainStreetCredXp', (data) => {
        if (players[socket.id]) {
            const result = addStreetCredXp(players[socket.id], data.amount);
            socket.emit('playerStats', players[socket.id]);
            if (result) socket.emit('levelUp', result);
        }
    });

    // Handle perk purchase
    socket.on('purchasePerk', (data) => {
        if (players[socket.id] && players[socket.id].perkPoints > 0) {
            const perkTree = PERK_TREES[data.stat];
            const perk = perkTree.find(p => p.id === data.perkId);
            
            if (perk && players[socket.id].stats[data.stat].value >= perk.reqStat) {
                players[socket.id].perks.push(data.perkId);
                players[socket.id].perkPoints--;
                socket.emit('playerStats', players[socket.id]);
            }
        }
    });

    socket.on('chatMessage', (msg) => {
        if (players[socket.id]) {
            io.emit('newMessage', { name: players[socket.id].name, text: msg });
            // Award small XP for social interaction
            addStreetCredXp(players[socket.id], 5);
            socket.emit('playerStats', players[socket.id]);
        }
    });

    // Combat XP - enemy defeated
    socket.on('enemyDefeated', (data) => {
        if (players[socket.id]) {
            // Award Street Cred XP
            const result = addStreetCredXp(players[socket.id], data.xp || 25);
            
            // Award skill XP based on weapon type
            if (data.weaponType) {
                addXp(players[socket.id], 'skill', data.weaponType, 20);
            }
            
            // Award stat XP
            if (data.stat) {
                addXp(players[socket.id], 'stat', data.stat, 10);
            }
            
            players[socket.id].derived = calculateDerivedStats(players[socket.id].stats, players[socket.id].skills);
            socket.emit('playerStats', players[socket.id]);
            if (result) socket.emit('levelUp', result);
        }
    });

    socket.on('pickupItem', (itemId) => {
        if (groundItems[itemId] && players[socket.id]) {
            players[socket.id].inventory.push(groundItems[itemId]);
            delete groundItems[itemId];
            io.emit('itemRemoved', itemId);
            socket.emit('updateInventory', players[socket.id].inventory);
            
            // Award XP for picking up items (exploration bonus)
            const result = addStreetCredXp(players[socket.id], 15);
            socket.emit('playerStats', players[socket.id]);
            if (result) socket.emit('levelUp', result);
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