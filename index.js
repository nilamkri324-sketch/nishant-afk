const fs = require('fs');
const path = require('path');
const mineflayer = require('mineflayer');
const { pathfinder, Movements } = require('mineflayer-pathfinder');
const express = require('express');

// Load configuration from settings.json
const settingsPath = path.join(__dirname, 'settings.json');
const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

if (settings.webServer.enabled) {
  const app = express();
  app.get('/', (req, res) => res.send('Bot is active and running!'));
  const port = process.env.PORT || settings.webServer.port || 3000;
  app.listen(port, () => console.log(`[WEB] Keep-alive server listening on port ${port}`));
}

let bot;
let actionInterval;

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function createBot() {
  bot = mineflayer.createBot({
    host: settings.server.host,
    port: settings.server.port,
    username: settings.bot.username,
    version: settings.server.version,
    auth: settings.bot.auth
  });

  bot.loadPlugin(pathfinder);

  bot.once('spawn', () => {
    console.log(`[ONLINE] ${settings.bot.username} joined ${settings.server.host}`);
    const mcData = require('minecraft-data')(bot.version);
    const defaultMove = new Movements(bot, mcData);
    bot.pathfinder.setMovements(defaultMove);

    if (settings.bot.loginPassword && settings.bot.loginPassword.trim() !== '') {
      setTimeout(() => {
        bot.chat(`/login ${settings.bot.loginPassword}`);
      }, 3000);
    }

    startHumanBehavior();
  });

  function startHumanBehavior() {
    if (actionInterval) clearInterval(actionInterval);

    const scheduleNext = () => {
      const delay = randomBetween(
        settings.behavior.actionIntervalMinMs,
        settings.behavior.actionIntervalMaxMs
      );

      actionInterval = setTimeout(() => {
        performAction();
        scheduleNext();
      }, delay);
    };

    scheduleNext();
  }

  function performAction() {
    if (!bot || !bot.entity) return;

    if (settings.combat.attackHostileMobs) {
      const mob = bot.nearestEntity(
        (e) =>
          e.type === 'mob' &&
          e.mobType !== 'Armor Stand' &&
          bot.entity.position.distanceTo(e.position) <= settings.combat.targetRadius
      );
      if (mob) {
        bot.lookAt(mob.position.offset(0, mob.height * 0.8, 0));
        bot.attack(mob);
        return;
      }
    }

    const actions = ['walk', 'idle'];
    if (settings.behavior.enableLook) actions.push('look');
    if (settings.behavior.enableJump) actions.push('jump');
    if (settings.behavior.enableSneak) actions.push('sneak');
    if (settings.behavior.enableSwing) actions.push('swing');

    const choice = actions[Math.floor(Math.random() * actions.length)];

    switch (choice) {
      case 'look': {
        const yaw = Math.random() * Math.PI * 2 - Math.PI;
        const pitch = Math.random() * 1.2 - 0.6;
        bot.look(yaw, pitch, false);
        break;
      }

      case 'walk': {
        const dirs = ['forward', 'back', 'left', 'right'];
        const dir = dirs[Math.floor(Math.random() * dirs.length)];
        bot.setControlState(dir, true);
        if (settings.behavior.enableSprint && Math.random() > 0.5) {
          bot.setControlState('sprint', true);
        }

        const walkTime = randomBetween(
          settings.behavior.walkDurationMinMs,
          settings.behavior.walkDurationMaxMs
        );

        setTimeout(() => {
          if (bot) {
            bot.setControlState(dir, false);
            bot.setControlState('sprint', false);
          }
        }, walkTime);
        break;
      }

      case 'jump': {
        bot.setControlState('jump', true);
        setTimeout(() => bot && bot.setControlState('jump', false), 300);
        break;
      }

      case 'sneak': {
        bot.setControlState('sneak', true);
        setTimeout(() => bot && bot.setControlState('sneak', false), randomBetween(600, 1400));
        break;
      }

      case 'swing': {
        bot.swingArm('right');
        break;
      }

      case 'idle':
      default:
        break;
    }
  }

  bot.on('death', () => {
    console.log('[EVENT] Bot died.');
    if (settings.bot.autoRespawn) {
      setTimeout(() => bot.respawn(), 2000);
    }
  });

  bot.on('kicked', (reason) => {
    console.log(`[KICKED] Reason: ${reason}`);
  });

  bot.on('error', (err) => {
    console.log(`[ERROR] ${err.message}`);
  });

  bot.on('end', () => {
    console.log(`[OFFLINE] Reconnecting in ${settings.bot.reconnectDelayMs / 1000}s...`);
    clearTimeout(actionInterval);
    setTimeout(createBot, settings.bot.reconnectDelayMs);
  });
}

createBot();
