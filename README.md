# 🎰 Roulette Royale - Multiplayer 3D Roulette Game

A stunning multiplayer roulette game with realistic 3D graphics, real-time gameplay, and authentic casino atmosphere.

## ✨ Features

- **Realistic 3D Roulette Wheel** - Built with Three.js and React Three Fiber
- **Authentic Ball Physics** - Realistic spinning, bouncing, and settling animations
- **Real-Time Multiplayer** - See other players' bets and wins instantly via WebSocket
- **Live Betting** - Interactive betting board with all standard roulette bet types
- **Luxurious UI** - Casino-inspired design with gold accents and smooth animations
- **Fake Money System** - Start with $10,000 virtual currency
- **Username System** - Enter a custom username when joining

## 🎮 Betting Options

- **Straight Up** - Bet on single numbers (35:1 payout)
- **Red/Black** - Bet on color (2:1 payout)
- **Even/Odd** - Bet on even or odd numbers (2:1 payout)
- **Low/High** - Bet on 1-18 or 19-36 (2:1 payout)
- **Dozens** - Bet on 1-12, 13-24, or 25-36 (3:1 payout)

## 🚀 Quick Start

### Prerequisites

- Node.js 16+ and npm
- Git

### Local Development

1. **Clone the repository**
```bash
git clone <your-repo-url>
cd roulette-game
```

2. **Install dependencies**
```bash
npm run install-all
```

3. **Run in development mode**
```bash
npm run dev
```

The server will start on port 3001 and the client on port 3000.

4. **Open your browser**
```
http://localhost:3000
```

## 🚂 Deploy to Railway

### Method 1: Deploy from GitHub

1. **Push your code to GitHub**
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin <your-github-repo-url>
git push -u origin main
```

2. **Deploy on Railway**
   - Go to [Railway.app](https://railway.app)
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose your repository
   - Railway will automatically detect the configuration

3. **Configure Environment**
   - Railway will auto-detect the Node.js project
   - No additional environment variables needed for basic setup

4. **Get your URL**
   - Railway will provide a public URL (e.g., `your-app.railway.app`)
   - The app will be live at this URL

### Method 2: Deploy with Railway CLI

1. **Install Railway CLI**
```bash
npm i -g @railway/cli
```

2. **Login to Railway**
```bash
railway login
```

3. **Initialize and deploy**
```bash
railway init
railway up
```

## 🎯 How to Play

1. **Join the Game**
   - Enter a username when you first visit
   - You'll start with $10,000 in fake money

2. **Place Bets**
   - Select your bet amount (chips: $10, $25, $50, $100, $250, $500, $1000)
   - Click on numbers or betting areas to place bets
   - You have 15 seconds to place bets before the wheel spins

3. **Watch the Spin**
   - The wheel automatically spins when bets are placed
   - Watch the realistic ball physics as it settles into a number

4. **Collect Winnings**
   - Winning bets are automatically paid out
   - Your balance updates in real-time
   - See all winners in the sidebar

5. **Play Again**
   - After results are shown, betting reopens
   - Clear your bets with the "Clear Bets" button if needed

## 🏗️ Architecture

### Frontend (React)
- **React** - UI framework
- **Three.js** - 3D graphics
- **@react-three/fiber** - React renderer for Three.js
- **@react-three/drei** - Three.js helpers
- **WebSocket** - Real-time communication

### Backend (Node.js)
- **Express** - Web server
- **ws** - WebSocket server
- **UUID** - Player identification

### Game Logic
- Authentic roulette number sequence
- Realistic payout calculations
- Automatic spin timer (15 seconds)
- Player balance management
- Multiplayer synchronization

## 📁 Project Structure

```
roulette-game/
├── client/                 # React frontend
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   │   ├── RouletteWheel.jsx    # 3D wheel with physics
│   │   │   └── BettingBoard.jsx     # Interactive betting board
│   │   ├── styles/
│   │   │   ├── App.css
│   │   │   └── BettingBoard.css
│   │   ├── App.js          # Main app component
│   │   └── index.js
│   └── package.json
├── server/                 # Node.js backend
│   ├── index.js           # WebSocket server & game logic
│   └── package.json
├── package.json           # Root package
├── railway.json           # Railway configuration
└── README.md
```

## 🎨 Design Features

- **Luxurious Casino Theme** - Dark purple/blue gradients with gold accents
- **Cinzel Font** - Elegant serif font for titles
- **Rajdhani Font** - Modern, readable font for UI
- **Smooth Animations** - Chip drops, ball physics, result popups
- **Responsive Layout** - Works on desktop and mobile
- **Glow Effects** - Atmospheric lighting and shadows

## 🔧 Technical Details

### WebSocket Messages

**Client → Server:**
- `join` - Join game with username
- `place_bet` - Place a bet
- `clear_bets` - Remove all player's bets

**Server → Client:**
- `joined` - Confirmation with player data
- `player_joined` - Another player joined
- `player_left` - Player disconnected
- `bet_placed` - Bet was placed
- `bets_cleared` - Bets were cleared
- `betting_open` - New round started
- `spin_start` - Wheel is spinning
- `spin_result` - Spin completed with winners

### Physics Simulation

The ball physics include:
- Decelerating wheel rotation
- Counter-rotating ball movement
- Spiral inward trajectory
- Height decay with gravity
- Bounce effect on landing
- Precise positioning on final number

## 📝 Environment Variables

For production deployment, you can set:

- `PORT` - Server port (default: 3001)
- `NODE_ENV` - Set to 'production' for Railway deployment

Railway automatically sets these, so no manual configuration needed!

## 🐛 Troubleshooting

**Issue: WebSocket connection fails**
- Check that the server is running
- Verify firewall settings allow WebSocket connections
- On Railway, ensure the PORT environment variable is set correctly

**Issue: 3D wheel not rendering**
- Ensure WebGL is supported in your browser
- Try a different browser (Chrome/Firefox recommended)
- Check browser console for errors

**Issue: Bets not registering**
- Ensure you have sufficient balance
- Check that betting is open (not during spin)
- Verify WebSocket connection is active

## 🤝 Contributing

Feel free to fork and improve this project! Some ideas:
- Add more bet types (splits, corners, streets)
- Implement chat system
- Add sound effects
- Create tournament mode
- Add statistics/history tracking

## 📄 License

MIT License - feel free to use this project however you like!

## 🎉 Enjoy!

Have fun playing Roulette Royale! Remember, it's all fake money, so bet big and enjoy the thrill! 🎰✨
