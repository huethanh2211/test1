const pokemonIds = Array.from({length: 151}, (_, i) => i + 1);

const GAME_ROWS = 10;
const GAME_COLS = 16;
const PADDING = 1;

// The actual logical size including borders for outer routing
const ROWS = GAME_ROWS + PADDING * 2;
const COLS = GAME_COLS + PADDING * 2;

let board = [];
let selectedTile = null;
let score = 0;
let timeRemaining = 300;
let timerInterval = null;
let isPlaying = false;
let hintCount = 3;

// DOM Elements
const boardEl = document.getElementById('board');
const svgEl = document.getElementById('path-overlay');
const scoreEl = document.getElementById('score');
const timerBar = document.getElementById('timer-bar');
const timerText = document.getElementById('timer-text');
const hintCountEl = document.getElementById('hint-count');

// Audio Context
const AudioContext = window.AudioContext || window.webkitAudioContext;
const audioCtx = new AudioContext();

function playSound(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    if (type === 'select') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, audioCtx.currentTime);
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.1);
    } else if (type === 'match') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(600, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.1);
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.2);
    } else if (type === 'error') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, audioCtx.currentTime);
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.15);
    } else if (type === 'win') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(400, audioCtx.currentTime);
        osc.frequency.setValueAtTime(600, audioCtx.currentTime + 0.1);
        osc.frequency.setValueAtTime(800, audioCtx.currentTime + 0.2);
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.3);
    }
}

let currentLevelName = 'Premium';

function initGame(levelName) {
    if (levelName) currentLevelName = levelName;

    score = 0;
    timeRemaining = 300;
    hintCount = 3;
    selectedTile = null;
    isPlaying = true;
    
    document.getElementById('level').innerText = currentLevelName;
    
    updateHUD();
    generateBoard();
    renderBoard();
    
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(gameLoop, 1000);
}

function generateBoard() {
    board = Array(ROWS).fill(null).map(() => Array(COLS).fill(0));
    
    // Choose icons
    const numPairs = (GAME_ROWS * GAME_COLS) / 2;
    let iconsToPlace = [];
    
    // Pick random target count based on level
    const typesCount = {'Easy': 10, 'Premium': 20, 'Hard': 40}[currentLevelName] || 20;

    // Ensure Pikachu (ID 25) is always in the game
    const safeIds = pokemonIds.filter(id => id !== 25);
    let selectedEmojis = [...safeIds].sort(() => 0.5 - Math.random()).slice(0, typesCount - 1);
    selectedEmojis.push(25);
    
    for (let i = 0; i < numPairs; i++) {
        let index = i % selectedEmojis.length;
        iconsToPlace.push(selectedEmojis[index], selectedEmojis[index]);
    }
    
    // Shuffle
    iconsToPlace.sort(() => 0.5 - Math.random());
    
    let index = 0;
    for (let r = 1; r <= GAME_ROWS; r++) {
        for (let c = 1; c <= GAME_COLS; c++) {
            board[r][c] = iconsToPlace[index++];
        }
    }
}

function renderBoard() {
    boardEl.innerHTML = '';
    // Set grid template
    boardEl.style.gridTemplateColumns = `repeat(${COLS}, 50px)`;
    boardEl.style.gridTemplateRows = `repeat(${ROWS}, 50px)`;
    
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const tile = document.createElement('div');
            tile.classList.add('tile');
            tile.dataset.r = r;
            tile.dataset.c = c;
            
            if (board[r][c] === 0) {
                tile.classList.add('empty');
            } else {
                const img = document.createElement('img');
                img.src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${board[r][c]}.png`;
                img.draggable = false;
                img.style.pointerEvents = 'none';
                img.style.width = '100%';
                img.style.height = '100%';
                img.style.objectFit = 'contain';
                img.style.transform = 'scale(1.1)';
                tile.appendChild(img);
                tile.addEventListener('click', handleTileClick);
            }
            
            boardEl.appendChild(tile);
        }
    }
}

function getTileDOM(r, c) {
    return document.querySelector(`.tile[data-r="${r}"][data-c="${c}"]`);
}

function handleTileClick(e) {
    if (!isPlaying) return;
    
    const r = parseInt(e.target.dataset.r);
    const c = parseInt(e.target.dataset.c);
    
    if (board[r][c] === 0) return;
    
    // Selecting the same tile
    if (selectedTile && selectedTile.r === r && selectedTile.c === c) {
        selectedTile.el.classList.remove('selected');
        selectedTile = null;
        return;
    }
    
    playSound('select');
    
    if (!selectedTile) {
        selectedTile = { r, c, el: e.target, value: board[r][c] };
        e.target.classList.add('selected');
    } else {
        // Second tile selected
        const first = selectedTile;
        const second = { r, c, el: e.target, value: board[r][c] };
        
        if (first.value === second.value) {
            const path = checkPath(first.r, first.c, second.r, second.c);
            if (path) {
                // Match
                processMatch(first, second, path);
            } else {
                // Incorrect path
                first.el.classList.remove('selected');
                second.el.classList.add('error');
                playSound('error');
                setTimeout(() => second.el.classList.remove('error'), 400);
                selectedTile = null;
            }
        } else {
            // Mismatch
            first.el.classList.remove('selected');
            second.el.classList.add('error');
            playSound('error');
            setTimeout(() => second.el.classList.remove('error'), 400);
            selectedTile = null;
        }
    }
}

function checkLineEmptyOrTarget(r1, c1, r2, c2, rTarget, cTarget) {
    if (r1 === r2) {
        const min = Math.min(c1, c2);
        const max = Math.max(c1, c2);
        for (let c = min + 1; c < max; c++) {
            if (board[r1][c] !== 0 && !(r1 === rTarget && c === cTarget)) return false;
        }
        return true;
    } else if (c1 === c2) {
        const min = Math.min(r1, r2);
        const max = Math.max(r1, r2);
        for (let r = min + 1; r < max; r++) {
            if (board[r][c1] !== 0 && !(r === rTarget && c1 === cTarget)) return false;
        }
        return true;
    }
    return false;
}

function checkPath(r1, c1, r2, c2) {
    // Check 0 turns (Straight line)
    if (r1 === r2 && checkLineEmptyOrTarget(r1, c1, r1, c2, r2, c2)) return [{r:r1, c:c1}, {r:r2, c:c2}];
    if (c1 === c2 && checkLineEmptyOrTarget(r1, c1, r2, c1, r2, c2)) return [{r:r1, c:c1}, {r:r2, c:c2}];
    
    // Check 1 turn (L-shape)
    if (board[r1][c2] === 0) {
        if (checkLineEmptyOrTarget(r1, c1, r1, c2, r2, c2) && checkLineEmptyOrTarget(r1, c2, r2, c2, r2, c2)) {
            return [{r:r1, c:c1}, {r:r1, c:c2}, {r:r2, c:c2}];
        }
    }
    if (board[r2][c1] === 0) {
        if (checkLineEmptyOrTarget(r1, c1, r2, c1, r2, c2) && checkLineEmptyOrTarget(r2, c1, r2, c2, r2, c2)) {
            return [{r:r1, c:c1}, {r:r2, c:c1}, {r:r2, c:c2}];
        }
    }
    
    // Check 2 turns (Z/U shape)
    for (let c = 0; c < COLS; c++) {
        if (c !== c1 && board[r1][c] === 0) {
            if (checkLineEmptyOrTarget(r1, c1, r1, c, r2, c2)) {
                // Now check 1-turn from (r1, c) to (r2, c2)
                if (board[r2][c] === 0 || (r2 === r2 && c === c2)) {
                    if (checkLineEmptyOrTarget(r1, c, r2, c, r2, c2) && checkLineEmptyOrTarget(r2, c, r2, c2, r2, c2)) {
                        return [{r:r1, c:c1}, {r:r1, c:c}, {r:r2, c:c}, {r:r2, c:c2}];
                    }
                }
            }
        }
    }
    for (let r = 0; r < ROWS; r++) {
        if (r !== r1 && board[r][c1] === 0) {
            if (checkLineEmptyOrTarget(r1, c1, r, c1, r2, c2)) {
                // Now check 1-turn from (r, c1) to (r2, c2)
                if (board[r][c2] === 0 || (r === r2 && c2 === c2)) {
                    if (checkLineEmptyOrTarget(r, c1, r, c2, r2, c2) && checkLineEmptyOrTarget(r, c2, r2, c2, r2, c2)) {
                        return [{r:r1, c:c1}, {r:r, c:c1}, {r:r, c:c2}, {r:r2, c:c2}];
                    }
                }
            }
        }
    }
    
    return null;
}

function processMatch(first, second, path) {
    playSound('match');
    score += 10;
    updateHUD();
    
    // Draw path
    drawPath(path);
    
    first.el.classList.remove('selected');
    first.el.classList.add('matched');
    second.el.classList.add('matched');
    
    board[first.r][first.c] = 0;
    board[second.r][second.c] = 0;
    
    setTimeout(() => {
        first.el.className = 'tile empty';
        first.el.innerHTML = '';
        second.el.className = 'tile empty';
        second.el.innerHTML = '';
        svgEl.innerHTML = ''; // clear path
        
        checkWinCondition();
    }, 400); // 400ms match animation
    
    selectedTile = null;
}

function drawPath(path) {
    svgEl.innerHTML = '';
    
    // We need to calculate line coordinates based on tile center positions.
    // However, SVG is absolute over the play-area. The board has a padding and gap.
    // It is simpler to just get bounding client rects.
    const svgRect = svgEl.getBoundingClientRect();
    
    if (path.length > 0) {
        const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        polyline.classList.add('path-line');
        
        let pointsStr = path.map(p => {
            const tileEl = getTileDOM(p.r, p.c);
            if(tileEl) {
                const rect = tileEl.getBoundingClientRect();
                const x = rect.left + rect.width / 2 - svgRect.left;
                const y = rect.top + rect.height / 2 - svgRect.top;
                return `${x},${y}`;
            }
            return '';
        }).join(" ");
        
        polyline.setAttribute('points', pointsStr);
        svgEl.appendChild(polyline);
    }
}

function checkWinCondition() {
    let emptyCount = 0;
    for (let r = 1; r <= GAME_ROWS; r++) {
        for (let c = 1; c <= GAME_COLS; c++) {
            if (board[r][c] === 0) emptyCount++;
        }
    }
    
    if (emptyCount === GAME_ROWS * GAME_COLS) {
        // WIN!
        playSound('win');
        isPlaying = false;
        clearInterval(timerInterval);
        score += timeRemaining * 2; // bonus points
        setTimeout(() => showModal('level-complete-modal'), 500);
        return;
    }
    
    // Also, should check if moves are available here to auto shuffle
    if (!checkAvailableMoves()) {
        shuffleBoard();
    }
}

function checkAvailableMoves() {
    for (let r1 = 1; r1 <= GAME_ROWS; r1++) {
        for (let c1 = 1; c1 <= GAME_COLS; c1++) {
            if (board[r1][c1] !== 0) {
                for (let r2 = 1; r2 <= GAME_ROWS; r2++) {
                    for (let c2 = 1; c2 <= GAME_COLS; c2++) {
                        if (board[r2][c2] !== 0 && (r1 !== r2 || c1 !== c2)) {
                            if (board[r1][c1] === board[r2][c2]) {
                                if (checkPath(r1, c1, r2, c2)) return true;
                            }
                        }
                    }
                }
            }
        }
    }
    return false;
}

function shuffleBoard() {
    // Extract non-zero elements
    let elements = [];
    for (let r = 1; r <= GAME_ROWS; r++) {
        for (let c = 1; c <= GAME_COLS; c++) {
            if (board[r][c] !== 0) elements.push(board[r][c]);
        }
    }
    
    // Shuffle
    elements.sort(() => 0.5 - Math.random());
    
    // Place back
    let idx = 0;
    for (let r = 1; r <= GAME_ROWS; r++) {
        for (let c = 1; c <= GAME_COLS; c++) {
            if (board[r][c] !== 0) {
                board[r][c] = elements[idx++];
            }
        }
    }
    
    // Visual shuffle
    boardEl.style.opacity = '0';
    setTimeout(() => {
        renderBoard();
        boardEl.style.opacity = '1';
        
        if (!checkAvailableMoves() && elements.length > 0) {
            shuffleBoard(); // try again
        }
    }, 300);
}

function gameLoop() {
    if (!isPlaying) return;
    timeRemaining--;
    updateHUD();
    
    if (timeRemaining <= 0) {
        isPlaying = false;
        clearInterval(timerInterval);
        document.getElementById('final-score').innerText = score;
        showModal('game-over-modal');
    }
}

function updateHUD() {
    scoreEl.innerText = score;
    timerText.innerText = timeRemaining + 's';
    timerBar.style.width = Math.max(0, (timeRemaining / 300) * 100) + '%';
    if (timeRemaining <= 30) {
        timerBar.style.backgroundColor = '#d90429';
    } else {
        timerBar.style.backgroundColor = '#52b788';
    }
    hintCountEl.innerText = hintCount;
}

function showModal(id) {
    document.getElementById('modal-overlay').classList.add('active');
    document.querySelectorAll('.modal').forEach(m => m.classList.remove('view-active'));
    document.getElementById(id).classList.add('view-active');
}

function hideModals() {
    document.getElementById('modal-overlay').classList.remove('active');
}

// Event Listeners
document.getElementById('btn-easy').addEventListener('click', () => {
    hideModals();
    initGame('Easy');
});

document.getElementById('btn-premium').addEventListener('click', () => {
    hideModals();
    initGame('Premium');
});

document.getElementById('btn-hard').addEventListener('click', () => {
    hideModals();
    initGame('Hard');
});

document.getElementById('btn-restart').addEventListener('click', () => {
    hideModals();
    initGame();
});

document.getElementById('btn-next-level').addEventListener('click', () => {
    hideModals();
    initGame();
});

document.getElementById('btn-pause').addEventListener('click', () => {
    if(isPlaying) {
        isPlaying = false;
        clearInterval(timerInterval);
        showModal('pause-modal');
    }
});

document.getElementById('btn-resume').addEventListener('click', () => {
    hideModals();
    isPlaying = true;
    timerInterval = setInterval(gameLoop, 1000);
});

document.getElementById('btn-shuffle').addEventListener('click', () => {
    if (!isPlaying) return;
    shuffleBoard();
});

document.getElementById('btn-hint').addEventListener('click', () => {
    if (!isPlaying || hintCount <= 0) return;
    
    for (let r1 = 1; r1 <= GAME_ROWS; r1++) {
        for (let c1 = 1; c1 <= GAME_COLS; c1++) {
            if (board[r1][c1] !== 0) {
                for (let r2 = 1; r2 <= GAME_ROWS; r2++) {
                    for (let c2 = 1; c2 <= GAME_COLS; c2++) {
                        if (board[r2][c2] !== 0 && (r1 !== r2 || c1 !== c2) && board[r1][c1] === board[r2][c2]) {
                            if (checkPath(r1, c1, r2, c2)) {
                                // show hint
                                const d1 = getTileDOM(r1, c1);
                                const d2 = getTileDOM(r2, c2);
                                d1.classList.add('selected');
                                d2.classList.add('selected');
                                setTimeout(() => {
                                    if(selectedTile !== d1) d1.classList.remove('selected');
                                    if(selectedTile !== d2) d2.classList.remove('selected');
                                }, 1000);
                                
                                hintCount--;
                                updateHUD();
                                return;
                            }
                        }
                    }
                }
            }
        }
    }
});

// Show initial modal
showModal('start-modal');
