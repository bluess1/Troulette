import express from 'express';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static('public'));

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocketServer({ server });

// Game state
let gameState = {
  spinning: false,
  bettingOpen: false,
  lastWinningNumber: null,
  players: new Map(),
  currentBets: [],
  history: [],
  bettingTimeRemaining: 0
};

let gameLoop = null;
const BETTING_TIME = 10; // 10 seconds to place bets
const SPIN_TIME = 10; // 10 seconds for spin

// Broadcast to all connected clients
function broadcast(data) {
  wss.clients.forEach(client => {
    if (client.readyState === 1) { // OPEN
      client.send(JSON.stringify(data));
    }
  });
}

// Generate unique player ID
function generatePlayerId() {
  return Math.random().toString(36).substr(2, 9);
}

// Start automatic game cycle
function startGameCycle() {
  if (gameLoop) return; // Already running
  
  gameLoop = setInterval(() => {
    if (!gameState.spinning && !gameState.bettingOpen) {
      startBettingPeriod();
    }
  }, 1000);
}

function startBettingPeriod() {
  gameState.bettingOpen = true;
  gameState.bettingTimeRemaining = BETTING_TIME;
  gameState.currentBets = [];
  
  broadcast({
    type: 'bettingStarted',
    bettingTime: BETTING_TIME
  });
  
  // Countdown and auto-spin
  const countdown = setInterval(() => {
    gameState.bettingTimeRemaining--;
    
    if (gameState.bettingTimeRemaining <= 0) {
      clearInterval(countdown);
      gameState.bettingOpen = false;
      spinWheel();
    }
  }, 1000);
}

function spinWheel() {
  if (gameState.spinning) return;
  
  gameState.spinning = true;
  
  broadcast({
    type: 'spinStarted'
  });
  
  // Simulate spin duration
  setTimeout(() => {
    const winningNumber = Math.floor(Math.random() * 37); // 0-36
    gameState.lastWinningNumber = winningNumber;
    
    // Process bets
    const results = [];
    gameState.currentBets.forEach(bet => {
      const won = checkWin(bet, winningNumber);
      const player = gameState.players.get(bet.playerId);
      
      if (player) {
        if (won) {
          const payout = calculatePayout(bet, winningNumber);
          player.balance += payout;
          player.totalWon += payout;
          
          results.push({
            playerId: bet.playerId,
            username: bet.username,
            won: true,
            amount: payout,
            bet: bet.amount
          });
        } else {
          player.totalLost += bet.amount;
          results.push({
            playerId: bet.playerId,
            username: bet.username,
            won: false,
            amount: 0,
            bet: bet.amount
          });
        }
      }
    });
    
    gameState.history.unshift(winningNumber);
    if (gameState.history.length > 20) {
      gameState.history = gameState.history.slice(0, 20);
    }
    
    broadcast({
      type: 'spinResult',
      winningNumber: winningNumber,
      results: results,
      history: gameState.history,
      players: Array.from(gameState.players.values())
    });
    
    gameState.currentBets = [];
    gameState.spinning = false;
  }, SPIN_TIME * 1000);
}

// Handle WebSocket connections
wss.on('connection', (ws) => {
  const playerId = generatePlayerId();
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      switch(data.type) {
        case 'join':
          gameState.players.set(playerId, {
            id: playerId,
            username: data.username,
            balance: 10000, // Starting balance
            totalWon: 0,
            totalLost: 0
          });
          
          ws.send(JSON.stringify({
            type: 'joined',
            playerId: playerId,
            player: gameState.players.get(playerId),
            gameState: {
              spinning: gameState.spinning,
              lastWinningNumber: gameState.lastWinningNumber,
              history: gameState.history,
              players: Array.from(gameState.players.values()),
              bettingTimeRemaining: gameState.bettingTimeRemaining
            }
          }));
          
          broadcast({
            type: 'playerJoined',
            player: gameState.players.get(playerId)
          });
          
          // Start game cycle if first player
          if (gameState.players.size === 1) {
            startGameCycle();
          }
          break;
          
        case 'placeBet':
          const player = gameState.players.get(playerId);
          if (player && player.balance >= data.amount && gameState.bettingOpen && !gameState.spinning) {
            player.balance -= data.amount;
            
            const bet = {
              playerId: playerId,
              username: player.username,
              type: data.betType,
              numbers: data.numbers,
              amount: data.amount,
              timestamp: Date.now()
            };
            
            gameState.currentBets.push(bet);
            
            broadcast({
              type: 'betPlaced',
              bet: bet,
              player: player
            });
          }
          break;
      }
    } catch (err) {
      console.error('Error processing message:', err);
    }
  });
  
  ws.on('close', () => {
    if (gameState.players.has(playerId)) {
      const player = gameState.players.get(playerId);
      gameState.players.delete(playerId);
      
      broadcast({
        type: 'playerLeft',
        playerId: playerId,
        username: player.username
      });
      
      // Stop game cycle if no players
      if (gameState.players.size === 0 && gameLoop) {
        clearInterval(gameLoop);
        gameLoop = null;
        gameState.bettingOpen = false;
        gameState.spinning = false;
      }
    }
  });
});

// Check if bet wins
function checkWin(bet, winningNumber) {
  return bet.numbers.includes(winningNumber);
}

// Calculate payout based on bet type
function calculatePayout(bet, winningNumber) {
  const betAmount = bet.amount;
  
  switch(bet.type) {
    case 'straight': return betAmount * 36; // Single number
    case 'split': return betAmount * 18; // Two numbers
    case 'street': return betAmount * 12; // Three numbers
    case 'corner': return betAmount * 9; // Four numbers
    case 'line': return betAmount * 6; // Six numbers
    case 'dozen': return betAmount * 3; // 12 numbers
    case 'column': return betAmount * 3; // 12 numbers
    case 'red':
    case 'black':
    case 'even':
    case 'odd':
    case 'low':
    case 'high':
      return betAmount * 2; // Even money bets
    default: return betAmount * 2;
  }
}

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
