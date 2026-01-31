// Game State
let ws;
let playerId;
let playerData;
let selectedChip = 10;
let currentBets = new Map(); // Track bets per cell
let scene, camera, renderer, wheel, ball;
const clock = new THREE.Clock();
let isSpinning = false;
let bettingTimeRemaining = 0;
let countdownInterval;
let bettingOpen = true;
let bettingCountdownStarted = false;
const BETTING_WINDOW_SECONDS = 18;
const zoomedCameraPosition = new THREE.Vector3(0, 9.5, 13);
const defaultCameraPosition = new THREE.Vector3(0, 17, 23);

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
    setupSpinControl();
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
            openBettingRound();
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
            updateSpinButtonState();
            break;
            
        case 'spinStarted':
            isSpinning = true;
            bettingOpen = false;
            stopBettingCountdown();
            document.getElementById('spinStatus').textContent = 'Spinning...';
            disableBetting();
            setBettingPhase(false);
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
                openBettingRound();
            }, 5000);
            break;
    }
}

function openBettingRound() {
    bettingOpen = true;
    bettingCountdownStarted = false;
    bettingTimeRemaining = BETTING_WINDOW_SECONDS;
    clearAllBets();
    clearLiveBets();
    enableBetting();
    setBettingPhase(true);
    updateSpinStatus();
    updateSpinButtonState();
}

function startBettingCountdown() {
    if (bettingCountdownStarted) return;
    bettingCountdownStarted = true;
    updateSpinStatus();

    if (countdownInterval) clearInterval(countdownInterval);

    countdownInterval = setInterval(() => {
        bettingTimeRemaining--;
        updateSpinStatus();

        if (bettingTimeRemaining <= 0) {
            clearInterval(countdownInterval);
            bettingCountdownStarted = false;
            if (currentBets.size > 0 && !isSpinning) {
                requestSpin();
            }
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
    if (!bettingOpen) {
        status.textContent = 'Wheel in motion...';
        return;
    }

    if (bettingCountdownStarted && bettingTimeRemaining > 0) {
        status.textContent = `Place bets: ${bettingTimeRemaining}s`;
    } else if (currentBets.size > 0) {
        status.textContent = 'Ready to spin';
    } else {
        status.textContent = 'Awaiting first wager';
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

function setBettingPhase(isOpen) {
    const gameContainer = document.getElementById('gameContainer');
    if (!gameContainer) return;
    gameContainer.classList.toggle('round-closed', !isOpen);
}

function setupSpinControl() {
    const spinButton = document.getElementById('spinButton');
    spinButton.addEventListener('click', () => {
        if (spinButton.disabled) return;
        requestSpin();
    });
}

function requestSpin() {
    if (isSpinning || currentBets.size === 0 || !bettingOpen) return;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    bettingOpen = false;
    disableBetting();
    setBettingPhase(false);
    updateSpinStatus();
    updateSpinButtonState();
    ws.send(JSON.stringify({ type: 'spin' }));
}

function updateSpinButtonState() {
    const spinButton = document.getElementById('spinButton');
    const shouldEnable = !isSpinning && bettingOpen && currentBets.size > 0;
    spinButton.disabled = !shouldEnable;
}

// 3D Wheel Setup
function init3DWheel() {
    const container = document.getElementById('canvas-container');
    
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b2f24);
    
    // Camera
    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.copy(defaultCameraPosition);
    camera.lookAt(0, 0, 0);
    
    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.physicallyCorrectLights = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    container.appendChild(renderer.domElement);
    
    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.35);
    scene.add(ambientLight);
    
    const spotLight = new THREE.SpotLight(0xffd6a0, 1.15);
    spotLight.position.set(8, 24, 10);
    spotLight.castShadow = true;
    spotLight.shadow.mapSize.width = 2048;
    spotLight.shadow.mapSize.height = 2048;
    scene.add(spotLight);
    
    const rimLight = new THREE.PointLight(0xf2c879, 0.85);
    rimLight.position.set(-14, 8, -8);
    scene.add(rimLight);

    const fillLight = new THREE.PointLight(0x7aa79b, 0.35);
    fillLight.position.set(0, 6, 14);
    scene.add(fillLight);

    const kickerLight = new THREE.PointLight(0xffffff, 0.3);
    kickerLight.position.set(14, 3, -12);
    scene.add(kickerLight);
    
    // Create roulette wheel
    createRouletteWheel();
    
    // Create ball
    createBall();
    
    // Animation loop
    clock.start();
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
    const baseGeometry = new THREE.CylinderGeometry(8.2, 8.2, 1.1, 64);
    const baseMaterial = new THREE.MeshPhysicalMaterial({ 
        map: createWoodTexture(),
        roughness: 0.32,
        metalness: 0.18,
        clearcoat: 0.65,
        clearcoatRoughness: 0.35,
        envMapIntensity: 0.9
    });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.receiveShadow = true;
    wheel.add(base);

    const baseLipGeometry = new THREE.CylinderGeometry(8.5, 8.1, 0.2, 80);
    const baseLipMaterial = new THREE.MeshPhysicalMaterial({
        color: 0x2a1a10,
        roughness: 0.3,
        metalness: 0.2,
        clearcoat: 0.7,
        clearcoatRoughness: 0.25
    });
    const baseLip = new THREE.Mesh(baseLipGeometry, baseLipMaterial);
    baseLip.position.y = 0.6;
    wheel.add(baseLip);
    
    // Inner bowl
    const bowlGeometry = new THREE.CylinderGeometry(7.1, 6.2, 0.9, 64);
    const bowlMaterial = new THREE.MeshPhysicalMaterial({ 
        color: 0x0f5b3a,
        roughness: 0.38,
        metalness: 0.12,
        clearcoat: 0.5,
        clearcoatRoughness: 0.45
    });
    const bowl = new THREE.Mesh(bowlGeometry, bowlMaterial);
    bowl.position.y = 0.55;
    wheel.add(bowl);

    const innerRingGeometry = new THREE.TorusGeometry(6.1, 0.25, 16, 100);
    const innerRingMaterial = new THREE.MeshPhongMaterial({
        color: 0x3b2a1a,
        shininess: 70
    });
    const innerRing = new THREE.Mesh(innerRingGeometry, innerRingMaterial);
    innerRing.rotation.x = Math.PI / 2;
    innerRing.position.y = 0.9;
    wheel.add(innerRing);

    const metalHubGeometry = new THREE.CylinderGeometry(1.6, 1.8, 0.6, 32);
    const metalHubMaterial = new THREE.MeshPhongMaterial({
        color: 0x8c7a4a,
        shininess: 120,
        specular: 0xfff2b0
    });
    const metalHub = new THREE.Mesh(metalHubGeometry, metalHubMaterial);
    metalHub.position.y = 0.95;
    wheel.add(metalHub);
    
    // Number pockets
    const pocketRadius = 5.35;
    const pocketCount = wheelNumbers.length;
    
    for (let i = 0; i < pocketCount; i++) {
        const angle = (i / pocketCount) * Math.PI * 2;
        const number = wheelNumbers[i];
        
        // Pocket
        const pocketGeometry = new THREE.BoxGeometry(0.74, 0.28, 0.58);
        let pocketColor;
        
        if (number === 0) {
            pocketColor = 0x2d5016; // Green
        } else if (redNumbers.includes(number)) {
            pocketColor = 0x8b0000; // Red
        } else {
            pocketColor = 0x000000; // Black
        }
        
        const pocketMaterial = new THREE.MeshPhysicalMaterial({ 
            color: pocketColor,
            roughness: 0.42,
            metalness: 0.18,
            clearcoat: 0.2,
            clearcoatRoughness: 0.6
        });
        const pocket = new THREE.Mesh(pocketGeometry, pocketMaterial);
        
        pocket.position.x = Math.cos(angle) * pocketRadius;
        pocket.position.z = Math.sin(angle) * pocketRadius;
        pocket.position.y = 0.82;
        pocket.rotation.y = -angle;
        
        pocket.castShadow = true;
        wheel.add(pocket);
        
        // Number label (using sprite)
        const label = createNumberLabel(number);
        label.position.x = Math.cos(angle) * (pocketRadius + 0.55);
        label.position.z = Math.sin(angle) * (pocketRadius + 0.55);
        label.position.y = 1.38;
        label.rotation.y = -angle + Math.PI / 2;
        label.rotation.x = -Math.PI / 2.1;
        wheel.add(label);
    }

    createNumberRing();

    scene.add(wheel);
}

function createNumberRing() {
    const ringGroup = new THREE.Group();
    const ringRadius = 6.6;
    const ringHeight = 0.35;
    const segmentAngle = (Math.PI * 2) / wheelNumbers.length;

    wheelNumbers.forEach((number, index) => {
        const color = number === 0 ? 0x1a7b42 : (redNumbers.includes(number) ? 0xd12a2a : 0x1a1a1a);
        const segmentGeometry = new THREE.CylinderGeometry(ringRadius, ringRadius, ringHeight, 8, 1, false, index * segmentAngle, segmentAngle);
        const segmentMaterial = new THREE.MeshPhysicalMaterial({
            color,
            roughness: 0.35,
            metalness: 0.2,
            clearcoat: 0.2,
            clearcoatRoughness: 0.6
        });
        const segment = new THREE.Mesh(segmentGeometry, segmentMaterial);
        segment.position.y = 1.45;
        segment.rotation.y = -segmentAngle / 2;
        ringGroup.add(segment);
    });

    wheel.add(ringGroup);
}

function createWoodTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 256, 256);
    gradient.addColorStop(0, '#5a2a0e');
    gradient.addColorStop(0.4, '#7a3a12');
    gradient.addColorStop(0.7, '#8a4a18');
    gradient.addColorStop(1, '#3f1b07');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 256, 256);

    ctx.globalAlpha = 0.35;
    for (let i = 0; i < 20; i++) {
        ctx.beginPath();
        ctx.strokeStyle = i % 2 === 0 ? '#8a4a1d' : '#3a1806';
        ctx.lineWidth = 6 + Math.random() * 8;
        ctx.moveTo(0, i * 12);
        ctx.bezierCurveTo(60, i * 12 + 10, 160, i * 12 - 10, 256, i * 12 + 6);
        ctx.stroke();
    }

    ctx.globalAlpha = 0.18;
    for (let i = 0; i < 120; i++) {
        ctx.fillStyle = i % 2 === 0 ? '#2a1206' : '#9a5a22';
        ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1.6, 1.6);
    return texture;
}

function createNumberLabel(number) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 128;
    canvas.height = 128;

    context.fillStyle = 'rgba(0,0,0,0)';
    context.fillRect(0, 0, 128, 128);
    context.fillStyle = '#f7d26a';
    context.font = 'bold 72px Cinzel';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(number.toString(), 64, 72);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.MeshStandardMaterial({
        map: texture,
        transparent: true,
        roughness: 0.4,
        metalness: 0.2
    });
    return new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.85), material);
}

function createBall() {
    const ballGeometry = new THREE.SphereGeometry(0.28, 32, 32);
    const ballMaterial = new THREE.MeshPhysicalMaterial({ 
        color: 0xf5f1e6,
        roughness: 0.1,
        metalness: 0.2,
        clearcoat: 0.85,
        clearcoatRoughness: 0.1
    });
    ball = new THREE.Mesh(ballGeometry, ballMaterial);
    ball.castShadow = true;
    ball.position.set(7.2, 1.35, 0);
    scene.add(ball);
}

let wheelSpeed = 0;
let ballSpeed = 0;
let ballAngle = 0;
let ballRadius = 6;
let ballHeight = 0.8;
let ballSpiralSpeed = 0.35;
let spinElapsed = 0;
let ballPhase = 'rim';

function startWheelSpin() {
    wheelSpeed = 0.16;
    ballSpeed = -0.27;
    ballAngle = Math.random() * Math.PI * 2;
    ballRadius = 6.4;
    ballHeight = 1.1;
}

function animate() {
    requestAnimationFrame(animate);
    const delta = Math.min(clock.getDelta(), 0.03);
    
    if (isSpinning && (wheelSpeed > 0.001 || ballSpeed < -0.001)) {
        spinElapsed += delta;
        // Rotate wheel
        wheel.rotation.y += wheelSpeed;
        wheelSpeed *= 0.995;

        // Move ball
        ballAngle += ballSpeed;

        // Ball gradually moves inward and down
        ballRadius -= 0.01;
        ballHeight -= 0.002;

        if (ballRadius < 3.1) ballRadius = 3.1;
        if (ballHeight < 1.0) ballHeight = 1.0;
        
        // Update ball position
        const wobble = Math.sin(spinElapsed * 7) * 0.045;
        ball.position.x = Math.cos(ballAngle) * ballRadius;
        ball.position.z = Math.sin(ballAngle) * ballRadius;
        ball.position.y = ballHeight + wobble;
        
        // Decelerate ball
        ballSpeed *= 0.988;
    } else {
        // Gentle idle rotation
        wheel.rotation.y += 0.001;
    }

    const zoomTarget = (isSpinning && wheelSpeed < 0.03) ? zoomedCameraPosition : defaultCameraPosition;
    camera.position.lerp(zoomTarget, 0.06);
    camera.lookAt(0, 0, 0);
    
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
                cell.dataset.color = 'red';
                cell.style.background = 'var(--roulette-red)';
            } else {
                cell.classList.add('black');
                cell.dataset.color = 'black';
                cell.style.background = 'var(--roulette-black)';
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
        clearBetsAndRefund();
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
    if (isSpinning || !bettingOpen) return;
    
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
    startBettingCountdown();
}

function clearBetsAndRefund() {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        clearAllBets();
        return;
    }
    if (currentBets.size === 0) {
        return;
    }
    ws.send(JSON.stringify({ type: 'clearBets' }));
    clearAllBets();
}

function placeBetData(betType, numbers, amount, cellId) {
    if (playerData.balance < amount) {
        alert('Insufficient balance!');
        return;
    }
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        alert('Connection lost. Rejoin to place bets.');
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
    updateSpinStatus();
    updateSpinButtonState();
    
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
    updateSpinStatus();
    updateSpinButtonState();
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
    div.dataset.playerId = bet.playerId;
    const betTypeLabel = (bet.betType || bet.type || '').toUpperCase();
    
    div.innerHTML = `
        <div class="bet-item-header">
            <span class="bet-username">${bet.username}</span>
            <span class="bet-amount">$${bet.amount}</span>
        </div>
        <div class="bet-type">${betTypeLabel}</div>
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

function removeLiveBetsForPlayer(playerId) {
    const container = document.getElementById('liveBets');
    const items = Array.from(container.querySelectorAll(`.bet-item[data-player-id="${playerId}"]`));
    items.forEach(item => item.remove());
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
