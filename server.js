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
  lastWinningNumber: null,
  players: new Map(),
  currentBets: [],
  history: []
};

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
              players: Array.from(gameState.players.values())
            }
          }));
          
          broadcast({
            type: 'playerJoined',
            player: gameState.players.get(playerId)
          });
          break;
          
        case 'placeBet':
          const player = gameState.players.get(playerId);
          if (player && player.balance >= data.amount && !gameState.spinning) {
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
          
        case 'spin':
          if (!gameState.spinning && gameState.currentBets.length > 0) {
            gameState.spinning = true;
            
            broadcast({
              type: 'spinStarted'
            });
            
            // Simulate spin duration (10 seconds)
            setTimeout(() => {
              const winningNumber = Math.floor(Math.random() * 37); // 0-36
              gameState.lastWinningNumber = winningNumber;
              
              // Process bets
              const results = [];
              gameState.currentBets.forEach(bet => {
                const won = checkWin(bet, winningNumber);
                const player = gameState.players.get(bet.playerId);
                
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
            }, 10000);
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
