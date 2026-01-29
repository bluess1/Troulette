// Game State
let ws;
let playerId;
let playerData;
let selectedChip = 10;
let currentBets = new Map(); // Track bets per cell
let scene, camera, renderer, wheel, ball;
let isSpinning = false;
let bettingTimeRemaining = 0;
let countdownInterval;

// Roulette wheel layout (European roulette)
const wheelNumbers = [
    0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
    5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
];

const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
const blackNumbers = [2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setupUsernameModal();
    setupChipSelector();
    setupBettingTable();
    setupBetControls();
});

function setupUsernameModal() {
    const input = document.getElementById('usernameInput');
    const joinBtn = document.getElementById('joinButton');
    
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && input.value.trim()) {
            joinGame(input.value.trim());
        }
    });
    
    joinBtn.addEventListener('click', () => {
        if (input.value.trim()) {
            joinGame(input.value.trim());
        }
    });
}

function joinGame(username) {
    // Connect to WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        ws.send(JSON.stringify({
            type: 'join',
            username: username
        }));
    };
    
    ws.onmessage = (event) => {
        handleWebSocketMessage(JSON.parse(event.data));
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
    
    ws.onclose = () => {
        console.log('WebSocket connection closed');
    };
}

function handleWebSocketMessage(data) {
    switch(data.type) {
        case 'joined':
            playerId = data.playerId;
            playerData = data.player;
            
            // Hide modal and show game
            document.getElementById('usernameModal').classList.remove('active');
            document.getElementById('gameContainer').style.display = 'block';
            
            // Update UI
            document.getElementById('playerUsername').textContent = playerData.username;
            document.getElementById('playerBalance').textContent = playerData.balance;
            
            // Initialize 3D wheel
            init3DWheel();
            
            // Update game state
            updateHistory(data.gameState.history);
            updatePlayersList(data.gameState.players);
            
            // If betting period active, start countdown
            if (data.gameState.bettingTimeRemaining > 0) {
                startBettingCountdown(data.gameState.bettingTimeRemaining);
            }
            break;
            
        case 'playerJoined':
            addPlayerToList(data.player);
            break;
            
        case 'playerLeft':
            removePlayerFromList(data.playerId);
            break;
            
        case 'betPlaced':
            if (data.bet.playerId === playerId) {
                updateBalance(data.player.balance);
            }
            addLiveBet(data.bet);
            break;
            
        case 'bettingStarted':
            startBettingCountdown(data.bettingTime);
            clearAllBets();
            clearLiveBets();
            break;
            
        case 'spinStarted':
            isSpinning = true;
            stopBettingCountdown();
            document.getElementById('spinStatus').textContent = 'Spinning...';
            disableBetting();
            startWheelSpin();
            break;
            
        case 'spinResult':
            showResults(data.winningNumber, data.results);
            updateHistory(data.history);
            updatePlayersList(data.players);
            
            // Update player balance if they were involved
            const playerResult = data.results.find(r => r.playerId === playerId);
            if (playerResult) {
                const updatedPlayer = data.players.find(p => p.id === playerId);
                updateBalance(updatedPlayer.balance);
            }
            
            setTimeout(() => {
                isSpinning = false;
                document.getElementById('resultsOverlay').classList.remove('active');
                enableBetting();
            }, 5000);
            break;
    }
}

function startBettingCountdown(seconds) {
    bettingTimeRemaining = seconds;
    enableBetting();
    updateSpinStatus();
    
    if (countdownInterval) clearInterval(countdownInterval);
    
    countdownInterval = setInterval(() => {
        bettingTimeRemaining--;
        updateSpinStatus();
        
        if (bettingTimeRemaining <= 0) {
            clearInterval(countdownInterval);
        }
    }, 1000);
}

function stopBettingCountdown() {
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
    bettingTimeRemaining = 0;
}

function updateSpinStatus() {
    const status = document.getElementById('spinStatus');
    if (bettingTimeRemaining > 0) {
        status.textContent = `Place bets: ${bettingTimeRemaining}s`;
    } else {
        status.textContent = 'Waiting for spin...';
    }
}

function enableBetting() {
    document.querySelectorAll('.bet-cell').forEach(cell => {
        cell.style.pointerEvents = 'auto';
        cell.style.opacity = '1';
    });
}

function disableBetting() {
    document.querySelectorAll('.bet-cell').forEach(cell => {
        cell.style.pointerEvents = 'none';
        cell.style.opacity = '0.7';
    });
}

// 3D Wheel Setup
function init3DWheel() {
    const container = document.getElementById('canvas-container');
    
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d3d29);
    
    // Camera
    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(0, 15, 20);
    camera.lookAt(0, 0, 0);
    
    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    
    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);
    
    const spotLight = new THREE.SpotLight(0xffd700, 0.8);
    spotLight.position.set(0, 30, 0);
    spotLight.castShadow = true;
    spotLight.shadow.mapSize.width = 2048;
    spotLight.shadow.mapSize.height = 2048;
    scene.add(spotLight);
    
    const rimLight = new THREE.PointLight(0xd4af37, 0.5);
    rimLight.position.set(10, 5, 10);
    scene.add(rimLight);
    
    // Create roulette wheel
    createRouletteWheel();
    
    // Create ball
    createBall();
    
    // Animation loop
    animate();
    
    // Handle window resize
    window.addEventListener('resize', () => {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    });
}

function createRouletteWheel() {
    wheel = new THREE.Group();
    
    // Base
    const baseGeometry = new THREE.CylinderGeometry(8, 8, 1, 64);
    const baseMaterial = new THREE.MeshPhongMaterial({ 
        color: 0x2a1810,
        shininess: 30
    });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.receiveShadow = true;
    wheel.add(base);
    
    // Inner bowl
    const bowlGeometry = new THREE.CylinderGeometry(7, 6, 0.8, 64);
    const bowlMaterial = new THREE.MeshPhongMaterial({ 
        color: 0x1a5c3f,
        shininess: 50
    });
    const bowl = new THREE.Mesh(bowlGeometry, bowlMaterial);
    bowl.position.y = 0.5;
    wheel.add(bowl);
    
    // Number pockets
    const pocketRadius = 5.5;
    const pocketCount = wheelNumbers.length;
    
    for (let i = 0; i < pocketCount; i++) {
        const angle = (i / pocketCount) * Math.PI * 2;
        const number = wheelNumbers[i];
        
        // Pocket
        const pocketGeometry = new THREE.BoxGeometry(0.8, 0.3, 0.6);
        let pocketColor;
        
        if (number === 0) {
            pocketColor = 0x2d5016; // Green
        } else if (redNumbers.includes(number)) {
            pocketColor = 0x8b0000; // Red
        } else {
            pocketColor = 0x000000; // Black
        }
        
        const pocketMaterial = new THREE.MeshPhongMaterial({ 
            color: pocketColor,
            shininess: 80
        });
        const pocket = new THREE.Mesh(pocketGeometry, pocketMaterial);
        
        pocket.position.x = Math.cos(angle) * pocketRadius;
        pocket.position.z = Math.sin(angle) * pocketRadius;
        pocket.position.y = 0.6;
        pocket.rotation.y = -angle;
        
        pocket.castShadow = true;
        wheel.add(pocket);
        
        // Number label (using sprite)
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 128;
        canvas.height = 128;
        
        context.fillStyle = '#ffd700';
        context.font = 'bold 80px Cinzel';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(number.toString(), 64, 64);
        
        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
        const sprite = new THREE.Sprite(spriteMaterial);
        
        sprite.position.x = Math.cos(angle) * pocketRadius;
        sprite.position.z = Math.sin(angle) * pocketRadius;
        sprite.position.y = 1.2;
        sprite.scale.set(0.8, 0.8, 1);
        
        wheel.add(sprite);
    }
    
    scene.add(wheel);
}

function createBall() {
    const ballGeometry = new THREE.SphereGeometry(0.3, 32, 32);
    const ballMaterial = new THREE.MeshPhongMaterial({ 
        color: 0xffffff,
        shininess: 100,
        specular: 0xffffff
    });
    ball = new THREE.Mesh(ballGeometry, ballMaterial);
    ball.castShadow = true;
    ball.position.set(6, 0.8, 0);
    scene.add(ball);
}

let wheelSpeed = 0;
let ballSpeed = 0;
let ballAngle = 0;
let ballRadius = 6;
let ballHeight = 0.8;

function startWheelSpin() {
    wheelSpeed = 0.15;
    ballSpeed = -0.25;
    ballAngle = Math.random() * Math.PI * 2;
    ballRadius = 6;
    ballHeight = 0.8;
}

function animate() {
    requestAnimationFrame(animate);
    
    if (isSpinning && (wheelSpeed > 0.001 || ballSpeed < -0.001)) {
        // Rotate wheel
        wheel.rotation.y += wheelSpeed;
        wheelSpeed *= 0.995;
        
        // Move ball
        ballAngle += ballSpeed;
        
        // Ball gradually moves inward and down
        ballRadius -= 0.015;
        ballHeight -= 0.003;
        
        if (ballRadius < 0.5) ballRadius = 0.5;
        if (ballHeight < 0.5) ballHeight = 0.5;
        
        // Update ball position
        ball.position.x = Math.cos(ballAngle) * ballRadius;
        ball.position.z = Math.sin(ballAngle) * ballRadius;
        ball.position.y = ballHeight;
        
        // Decelerate ball
        ballSpeed *= 0.992;
    } else {
        // Gentle idle rotation
        wheel.rotation.y += 0.001;
    }
    
    renderer.render(scene, camera);
}

// Betting Table Setup
function setupBettingTable() {
    const mainGrid = document.querySelector('.main-grid');
    
    // Create numbers in proper roulette layout (3 rows)
    // Row 1: 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36
    // Row 2: 2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35
    // Row 3: 1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34
    
    for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 12; col++) {
            const number = (col * 3) + (3 - row);
            const cell = document.createElement('div');
            cell.className = 'bet-cell number-cell';
            cell.dataset.number = number;
            cell.dataset.type = 'straight';
            cell.textContent = number;
            cell.id = `bet-cell-${number}`;
            
            if (redNumbers.includes(number)) {
                cell.classList.add('red');
            } else {
                cell.classList.add('black');
            }
            
            cell.addEventListener('click', () => placeBet(cell));
            mainGrid.appendChild(cell);
        }
    }
    
    // Setup outside bets
    document.querySelectorAll('.bet-cell').forEach(cell => {
        if (!cell.classList.contains('number-cell') && !cell.id) {
            const betType = cell.dataset.type;
            cell.id = `bet-cell-${betType}`;
            cell.addEventListener('click', () => placeBet(cell));
        }
    });
}

function setupChipSelector() {
    document.querySelectorAll('.chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('.chip').forEach(c => c.classList.remove('selected'));
            chip.classList.add('selected');
            selectedChip = parseInt(chip.dataset.value);
        });
    });
    
    // Select first chip by default
    document.querySelector('.chip').classList.add('selected');
}

function setupBetControls() {
    document.getElementById('clearBets').addEventListener('click', () => {
        clearAllBets();
    });
    
    document.getElementById('doubleBets').addEventListener('click', () => {
        const betsToDouble = Array.from(currentBets.entries());
        betsToDouble.forEach(([cellId, bet]) => {
            if (playerData.balance >= bet.amount) {
                const cell = document.getElementById(cellId);
                if (cell) {
                    placeBetData(bet.type, bet.numbers, bet.amount, cellId);
                }
            }
        });
    });
}

function placeBet(cell) {
    if (isSpinning || bettingTimeRemaining <= 0) return;
    
    const betType = cell.dataset.type || 'straight';
    let numbers = [];
    
    if (cell.dataset.number) {
        numbers = [parseInt(cell.dataset.number)];
    } else if (cell.dataset.numbers) {
        numbers = cell.dataset.numbers.split(',').map(n => parseInt(n));
    } else {
        // Handle special bets
        numbers = getNumbersForBetType(betType);
    }
    
    placeBetData(betType, numbers, selectedChip, cell.id);
}

function placeBetData(betType, numbers, amount, cellId) {
    if (playerData.balance < amount) {
        alert('Insufficient balance!');
        return;
    }
    
    // Store bet
    if (!currentBets.has(cellId)) {
        currentBets.set(cellId, {
            betType: betType,
            numbers: numbers,
            amount: amount,
            cellId: cellId
        });
    } else {
        // Add to existing bet
        const existingBet = currentBets.get(cellId);
        existingBet.amount += amount;
    }
    
    // Display chip on cell
    displayChipOnCell(cellId, amount);
    
    ws.send(JSON.stringify({
        type: 'placeBet',
        betType: betType,
        numbers: numbers,
        amount: amount
    }));
}

function displayChipOnCell(cellId, amount) {
    const cell = document.getElementById(cellId);
    if (!cell) return;
    
    // Remove existing chip if any
    const existingChip = cell.querySelector('.bet-chip');
    if (existingChip) {
        existingChip.remove();
    }
    
    // Get total bet amount for this cell
    const bet = currentBets.get(cellId);
    const totalAmount = bet ? bet.amount : amount;
    
    // Create chip element
    const chip = document.createElement('div');
    chip.className = 'bet-chip';
    chip.dataset.value = selectedChip;
    chip.textContent = totalAmount;
    
    cell.appendChild(chip);
}

function clearAllBets() {
    currentBets.clear();
    document.querySelectorAll('.bet-chip').forEach(chip => chip.remove());
}

function getNumbersForBetType(type) {
    switch(type) {
        case 'red':
            return redNumbers;
        case 'black':
            return blackNumbers;
        case 'even':
            return [2,4,6,8,10,12,14,16,18,20,22,24,26,28,30,32,34,36];
        case 'odd':
            return [1,3,5,7,9,11,13,15,17,19,21,23,25,27,29,31,33,35];
        case 'low':
            return Array.from({length: 18}, (_, i) => i + 1);
        case 'high':
            return Array.from({length: 18}, (_, i) => i + 19);
        default:
            return [];
    }
}

// UI Updates
function updateBalance(balance) {
    playerData.balance = balance;
    document.getElementById('playerBalance').textContent = balance;
}

function updateHistory(history) {
    const container = document.getElementById('historyNumbers');
    container.innerHTML = '';
    
    history.forEach(num => {
        const div = document.createElement('div');
        div.className = 'history-number';
        div.textContent = num;
        
        if (num === 0) {
            div.classList.add('green');
        } else if (redNumbers.includes(num)) {
            div.classList.add('red');
        } else {
            div.classList.add('black');
        }
        
        container.appendChild(div);
    });
}

function addLiveBet(bet) {
    const container = document.getElementById('liveBets');
    const div = document.createElement('div');
    div.className = 'bet-item';
    
    div.innerHTML = `
        <div class="bet-item-header">
            <span class="bet-username">${bet.username}</span>
            <span class="bet-amount">$${bet.amount}</span>
        </div>
        <div class="bet-type">${bet.type.toUpperCase()}</div>
    `;
    
    container.insertBefore(div, container.firstChild);
    
    // Limit to 10 recent bets
    while (container.children.length > 10) {
        container.removeChild(container.lastChild);
    }
}

function clearLiveBets() {
    document.getElementById('liveBets').innerHTML = '';
}

function updatePlayersList(players) {
    const container = document.getElementById('playersList');
    container.innerHTML = '';
    
    players.forEach(player => {
        const div = document.createElement('div');
        div.className = 'player-item';
        div.dataset.playerId = player.id;
        
        div.innerHTML = `
            <span class="player-name">${player.username}</span>
            <span class="player-balance">$${player.balance}</span>
        `;
        
        container.appendChild(div);
    });
}

function addPlayerToList(player) {
    const container = document.getElementById('playersList');
    const div = document.createElement('div');
    div.className = 'player-item';
    div.dataset.playerId = player.id;
    
    div.innerHTML = `
        <span class="player-name">${player.username}</span>
        <span class="player-balance">$${player.balance}</span>
    `;
    
    container.appendChild(div);
}

function removePlayerFromList(playerId) {
    const item = document.querySelector(`[data-player-id="${playerId}"]`);
    if (item) {
        item.remove();
    }
}

function showResults(winningNumber, results) {
    const overlay = document.getElementById('resultsOverlay');
    const numberDisplay = document.getElementById('winningNumberDisplay');
    const resultsList = document.getElementById('resultsList');
    
    // Show winning number
    numberDisplay.textContent = winningNumber;
    if (winningNumber === 0) {
        numberDisplay.style.color = '#2ecc71';
    } else if (redNumbers.includes(winningNumber)) {
        numberDisplay.style.color = '#e74c3c';
    } else {
        numberDisplay.style.color = '#ecf0f1';
    }
    
    // Show results
    resultsList.innerHTML = '';
    results.forEach(result => {
        const div = document.createElement('div');
        div.className = `result-item ${result.won ? 'won' : 'lost'}`;
        
        div.innerHTML = `
            <span class="result-player">${result.username}</span>
            <span class="result-amount ${result.won ? 'won' : 'lost'}">
                ${result.won ? '+' : '-'}$${result.won ? result.amount : result.bet}
            </span>
        `;
        
        resultsList.appendChild(div);
    });
    
    overlay.classList.add('active');
}
