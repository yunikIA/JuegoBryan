const ENTITIES = {
  farmer: { emoji: '🧑‍🌾', name: 'Granjero' },
  fox: { emoji: '🦊', name: 'Zorro' },
  chicken: { emoji: '🐔', name: 'Gallina' },
  corn: { emoji: '🌽', name: 'Maíz' }
};

const STORAGE_KEY = 'rio-granjero-leaderboard';

let unsubscribeFirebase = null; // para limpiar el listener en tiempo real

function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveHistory(history) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}

async function addToHistory(name, movesCount, seconds) {
  const entry = {
    name: name || 'Anonimo',
    moves: movesCount,
    time: seconds,
    date: new Date().toLocaleDateString('es-ES'),
    timestamp: Date.now()
  };

  // Esperar hasta 3s a que Firebase esté listo
  if (!window.firebase_addScore) {
    await new Promise(resolve => {
      const timeout = setTimeout(resolve, 3000);
      window.addEventListener('firebaseReady', () => { clearTimeout(timeout); resolve(); }, { once: true });
    });
  }

  if (window.firebase_addScore) {
    try {
      await window.firebase_addScore(entry);
    } catch (e) {
      console.warn('Error guardando en Firebase, usando localStorage:', e);
      _addToLocalStorage(entry);
    }
  } else {
    _addToLocalStorage(entry);
  }
}

function _addToLocalStorage(entry) {
  const history = getHistory();
  history.push(entry);
  history.sort((a, b) => a.moves - b.moves || a.time - b.time);
  if (history.length > 20) history.length = 20;
  saveHistory(history);
  renderLeaderboard();
}

function setupLeaderboardListener() {
  const tryConnect = () => {
    if (window.firebase_onLeaderboard) {
      if (unsubscribeFirebase) unsubscribeFirebase();
      unsubscribeFirebase = window.firebase_onLeaderboard((entries) => {
        renderLeaderboard(entries);
      });
    } else {
      // Firebase aún no cargó, esperar el evento
      window.addEventListener('firebaseReady', tryConnect, { once: true });
    }
  };
  tryConnect();
}

let state = {};
let moves = 0;
let animating = false;
let gameOver = false;
let timerInterval = null;
let startTime = null;
let elapsedSeconds = 0;

const leftChars = document.getElementById('left-characters');
const rightChars = document.getElementById('right-characters');
const boat = document.getElementById('boat');
const boatPassengers = document.getElementById('boat-passengers');
const movesEl = document.getElementById('moves');
const statusMsg = document.getElementById('status-message');
const overlay = document.getElementById('overlay');
const overlayBox = document.getElementById('overlay-box');
const overlayIcon = document.getElementById('overlay-icon');
const overlayTitle = document.getElementById('overlay-title');
const overlayMessage = document.getElementById('overlay-message');
const buttons = document.querySelectorAll('.move-btn');
const timerEl = document.getElementById('timer');
const playerNameInput = document.getElementById('player-name');
const leaderboardBody = document.getElementById('leaderboard-body');
const leaderboardEmpty = document.getElementById('leaderboard-empty');
const leaderboardTable = document.getElementById('leaderboard-table');

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  gain.gain.value = 0.15;

  if (type === 'move') {
    osc.type = 'sine';
    osc.frequency.value = 440;
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.3);
  } else if (type === 'win') {
    osc.type = 'square';
    osc.frequency.value = 523;
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.6);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.6);
    setTimeout(() => {
      const o2 = audioCtx.createOscillator();
      const g2 = audioCtx.createGain();
      o2.connect(g2); g2.connect(audioCtx.destination);
      g2.gain.value = 0.15;
      o2.type = 'square';
      o2.frequency.value = 659;
      g2.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
      o2.start(); o2.stop(audioCtx.currentTime + 0.5);
    }, 200);
  } else if (type === 'lose') {
    osc.type = 'sawtooth';
    osc.frequency.value = 200;
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.5);
  }
}

function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

function startTimer() {
  stopTimer();
  startTime = Date.now();
  elapsedSeconds = 0;
  timerEl.textContent = '00:00';
  timerInterval = setInterval(() => {
    elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
    timerEl.textContent = formatTime(elapsedSeconds);
  }, 500);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}



function renderLeaderboard(firebaseEntries) {
  const history = firebaseEntries || getHistory();
  leaderboardBody.innerHTML = '';

  if (history.length === 0) {
    leaderboardTable.style.display = 'none';
    leaderboardEmpty.style.display = 'block';
    if (!firebaseEntries && window.firebaseReady === undefined) {
      leaderboardEmpty.textContent = 'Cargando ranking...';
    } else {
      leaderboardEmpty.textContent = 'Sin registros aun. Gana una partida para aparecer aqui.';
    }
    return;
  }

  leaderboardTable.style.display = 'table';
  leaderboardEmpty.style.display = 'none';

  history.forEach((entry, i) => {
    const tr = document.createElement('tr');
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '';
    tr.innerHTML =
      '<td>' + (medal || (i + 1)) + '</td>' +
      '<td>' + escapeHtml(entry.name) + '</td>' +
      '<td>' + entry.moves + '</td>' +
      '<td>' + formatTime(entry.time) + '</td>' +
      '<td>' + entry.date + '</td>';
    leaderboardBody.appendChild(tr);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function init() {
  state = {
    farmer: 'left',
    fox: 'left',
    chicken: 'left',
    corn: 'left'
  };
  moves = 0;
  animating = false;
  gameOver = false;
  movesEl.textContent = '0';
  if (!playerNameInput.value.trim()) {
    statusMsg.textContent = '✏️ Ingresá tu nombre para jugar';
    statusMsg.className = 'error';
  } else {
    statusMsg.textContent = 'Elige qué llevar en el bote';
    statusMsg.className = '';
  }
  overlay.classList.add('hidden');
  boatPassengers.textContent = '';
  stopTimer();
  timerEl.textContent = '00:00';
  startTime = null;
  render();
}

function render() {
  leftChars.innerHTML = '';
  rightChars.innerHTML = '';

  for (const [key, info] of Object.entries(ENTITIES)) {
    const el = document.createElement('div');
    el.className = 'character';
    el.innerHTML = '<span>' + info.emoji + '</span><span class="label">' + info.name + '</span>';

    if (state[key] === 'left') {
      leftChars.appendChild(el);
    } else {
      rightChars.appendChild(el);
    }
  }

  boat.className = state.farmer === 'left' ? 'at-left' : 'at-right';

  buttons.forEach(btn => {
    const passenger = btn.dataset.passenger;
    if (passenger === 'none') {
      btn.disabled = animating || gameOver;
    } else {
      btn.disabled = animating || gameOver || state[passenger] !== state.farmer;
    }
  });
}

function move(passenger) {
  if (animating || gameOver) return;

  // Validar nombre antes del primer movimiento
  if (!startTime && !playerNameInput.value.trim()) {
    playerNameInput.focus();
    playerNameInput.style.borderColor = '#ff6b6b';
    statusMsg.textContent = '¡Ingresá tu nombre para jugar!';
    statusMsg.className = 'error';
    document.getElementById('scene').classList.add('shake');
    setTimeout(() => document.getElementById('scene').classList.remove('shake'), 500);
    setTimeout(() => { playerNameInput.style.borderColor = ''; }, 2000);
    return;
  }

  if (passenger !== 'none' && state[passenger] !== state.farmer) {
    statusMsg.textContent = 'El ' + ENTITIES[passenger].name + ' no está en tu orilla';
    statusMsg.className = 'error';
    document.getElementById('scene').classList.add('shake');
    setTimeout(() => document.getElementById('scene').classList.remove('shake'), 500);
    return;
  }

  if (!startTime) startTimer();

  animating = true;
  buttons.forEach(b => b.disabled = true);

  const from = state.farmer;
  const to = from === 'left' ? 'right' : 'left';

  let boatContent = ENTITIES.farmer.emoji;
  if (passenger !== 'none') {
    boatContent += ' ' + ENTITIES[passenger].emoji;
  }
  boatPassengers.textContent = boatContent;

  state.farmer = 'crossing';
  if (passenger !== 'none') state[passenger] = 'crossing';
  render();

  boat.className = to === 'left' ? 'at-left' : 'at-right';
  playSound('move');

  setTimeout(() => {
    state.farmer = to;
    if (passenger !== 'none') state[passenger] = to;
    moves++;
    movesEl.textContent = moves;
    boatPassengers.textContent = '';
    animating = false;

    checkState();
    render();
  }, 1000);
}

function checkState() {
  if (state.fox === 'right' && state.chicken === 'right' && state.corn === 'right') {
    gameOver = true;
    stopTimer();
    statusMsg.textContent = '¡Victoria! Todos cruzaron a salvo';
    statusMsg.className = 'success';
    playSound('win');
    addToHistory(playerNameInput.value.trim(), moves, elapsedSeconds);
    showOverlay('win');
    return;
  }

  if (state.fox === state.chicken && state.farmer !== state.fox) {
    gameOver = true;
    stopTimer();
    statusMsg.textContent = 'El zorro se comió a la gallina';
    statusMsg.className = 'error';
    playSound('lose');
    highlightDanger(state.fox);
    setTimeout(() => showOverlay('lose', 'El zorro se comió a la gallina 🦊🐔'), 800);
    return;
  }

  if (state.chicken === state.corn && state.farmer !== state.chicken) {
    gameOver = true;
    stopTimer();
    statusMsg.textContent = 'La gallina se comió el maíz';
    statusMsg.className = 'error';
    playSound('lose');
    highlightDanger(state.chicken);
    setTimeout(() => showOverlay('lose', 'La gallina se comió el maíz 🐔🌽'), 800);
    return;
  }

  statusMsg.textContent = 'Turno ' + (moves + 1) + ' — Elige qué llevar';
  statusMsg.className = '';
}

function highlightDanger(side) {
  const bankEl = side === 'left'
    ? document.getElementById('bank-left')
    : document.getElementById('bank-right');
  bankEl.classList.add('flash-danger');
  setTimeout(() => bankEl.classList.remove('flash-danger'), 2000);
}

function showOverlay(type, msg) {
  overlay.classList.remove('hidden');
  overlayBox.className = type;

  if (type === 'win') {
    overlayIcon.textContent = '🎉';
    overlayTitle.textContent = '¡Ganaste!';
    overlayMessage.textContent = moves + ' movimientos en ' + formatTime(elapsedSeconds);
  } else {
    overlayIcon.textContent = '💀';
    overlayTitle.textContent = '¡Perdiste!';
    overlayMessage.textContent = msg || 'Algo salió mal...';
  }
}

// Feedback visual en tiempo real del nombre
playerNameInput.addEventListener('input', () => {
  if (playerNameInput.value.trim()) {
    playerNameInput.classList.add('filled');
    playerNameInput.style.borderColor = '';
    if (!gameOver && !startTime) {
      statusMsg.textContent = 'Elige qué llevar en el bote';
      statusMsg.className = '';
    }
  } else {
    playerNameInput.classList.remove('filled');
    statusMsg.textContent = '✏️ Ingresá tu nombre para jugar';
    statusMsg.className = 'error';
  }
});

buttons.forEach(btn => {
  btn.addEventListener('click', () => {
    move(btn.dataset.passenger);
  });
});

document.getElementById('restart-btn').addEventListener('click', init);
document.getElementById('overlay-restart').addEventListener('click', init);

// Borrar historial solo disponible desde el panel admin
document.getElementById('clear-history').addEventListener('click', () => {
  alert('Para borrar el historial usá el panel de administración en /admin.html');
});

setupLeaderboardListener();
init();
