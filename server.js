import express from 'express';
import { WebSocketServer } from 'ws';
import http from 'http';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

let gameState = {
  spinning: false,
  lastWinningNumber: null,
  players: new Map(),
  currentBets: [],
  history: []
};

function broadcast(data) {
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(JSON.stringify(data));
  });
}

const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];

wss.on('connection', (ws) => {
  const playerId = Math.random().toString(36).substr(2, 9);
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      switch(data.type) {
        case 'join':
          gameState.players.set(playerId, {
            id: playerId,
            username: data.username,
            balance: 10000,
          });
          ws.send(JSON.stringify({
            type: 'joined',
            playerId,
            player: gameState.players.get(playerId),
            gameState: { ...gameState, players: Array.from(gameState.players.values()) }
          }));
          break;
          
        case 'placeBet':
          const player = gameState.players.get(playerId);
          if (player && player.balance >= data.amount && !gameState.spinning) {
            player.balance -= data.amount;
            const bet = { playerId, username: player.username, ...data };
            gameState.currentBets.push(bet);
            broadcast({ type: 'betPlaced', bet, player });
          }
          break;

        case 'clearBets':
          if (!gameState.spinning) {
            const playerToRefund = gameState.players.get(playerId);
            if (playerToRefund) {
              const betsToRefund = gameState.currentBets.filter(bet => bet.playerId === playerId);
              const refundTotal = betsToRefund.reduce((sum, bet) => sum + bet.amount, 0);
              if (refundTotal > 0) {
                playerToRefund.balance += refundTotal;
              }
              gameState.currentBets = gameState.currentBets.filter(bet => bet.playerId !== playerId);
              ws.send(JSON.stringify({
                type: 'betsCleared',
                playerId,
                balance: playerToRefund.balance,
                refundTotal
              }));
              broadcast({
                type: 'betsClearedNotice',
                playerId
              });
            }
          }
          break;
          
        case 'spin':
          if (!gameState.spinning && gameState.currentBets.length > 0) {
            gameState.spinning = true;
            broadcast({ type: 'spinStarted' });
            
            setTimeout(() => {
              const winningNumber = Math.floor(Math.random() * 37);
              gameState.lastWinningNumber = winningNumber;
              const results = gameState.currentBets.map(bet => {
                const won = bet.numbers.includes(winningNumber);
                const p = gameState.players.get(bet.playerId);
                let payout = 0;
                if (won) {
                    payout = calculatePayout(bet);
                    p.balance += payout;
                }
                return { username: bet.username, won, amount: payout, bet: bet.amount, playerId: bet.playerId };
              });

              gameState.history.unshift(winningNumber);
              gameState.history = gameState.history.slice(0, 10);
              broadcast({
                type: 'spinResult',
                winningNumber,
                results,
                history: gameState.history,
                players: Array.from(gameState.players.values())
              });
              gameState.currentBets = [];
              gameState.spinning = false;
            }, 8000); // 8 seconds for animation
          }
          break;
      }
    } catch (e) { console.error(e); }
  });
});

function calculatePayout(bet) {
    if (bet.betType === 'straight') return bet.amount * 36;
    if (['red', 'black', 'even', 'odd', 'low', 'high'].includes(bet.betType)) return bet.amount * 2;
    if (bet.betType === 'dozen') return bet.amount * 3;
    return bet.amount * 2;
}

server.listen(PORT, () => console.log(`Server on port ${PORT}`));
