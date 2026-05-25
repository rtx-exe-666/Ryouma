/**
 * app.js — Main application controller
 * Wires together:  MediaPipe Hands → GestureRecognizer → DrawEngine → UI
 */

(function () {
  'use strict';

  /* ── DOM refs ─────────────────────────────────────────────────────── */
  const splash          = document.getElementById('splash');
  const app             = document.getElementById('app');
  const startBtn        = document.getElementById('startBtn');
  const webcamEl        = document.getElementById('webcam');
  const drawCanvas      = document.getElementById('drawCanvas');
  const landmarkCanvas  = document.getElementById('landmarkCanvas');
  const loadingOverlay  = document.getElementById('loadingOverlay');
  const loadingMsg      = document.getElementById('loadingMsg');
  const gestureIndicator= document.getElementById('gestureIndicator');
  const cursorDot       = document.getElementById('cursorDot');
  const gestureStatus   = document.getElementById('gestureStatus');
  const fpsDisplay      = document.getElementById('fpsDisplay');
  const handStatus      = document.getElementById('handStatus');

  // Toolbar controls
  const colorBtns       = document.querySelectorAll('.color-btn');
  const customColor     = document.getElementById('customColor');
  const brushSizeSlider = document.getElementById('brushSize');
  const brushSizeVal    = document.getElementById('brushSizeVal');
  const styleBtns       = document.querySelectorAll('.style-btn');
  const opacitySlider   = document.getElementById('opacitySlider');
  const opacityVal      = document.getElementById('opacityVal');
  const undoBtn         = document.getElementById('undoBtn');
  const clearBtn        = document.getElementById('clearBtn');
  const saveBtn         = document.getElementById('saveBtn');
  const mirrorBtn       = document.getElementById('mirrorBtn');

  /* ── state ─────────────────────────────────────────────────────────── */
  let mirrored          = true;
  let currentGesture    = 'none';
  let prevGesture       = 'none';
  let gestureHoldCount  = 0;
  const GESTURE_HOLD    = 4;
  let clearHoldCount    = 0;
  const CLEAR_HOLD      = 20;

  // FPS tracking
  let fps = 0, frameCount = 0, lastFpsTime = performance.now();

  // Gesture indicator timer
  let gIndicatorTimer = null;

  /* ── canvas sizing ───────────────────────────────────────────────── */
  function resizeCanvases() {
    const stage = document.getElementById('stage');
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    drawCanvas.width     = w;
    drawCanvas.height    = h;
    landmarkCanvas.width = w;
    landmarkCanvas.height= h;
  }

  /* ── start flow ──────────────────────────────────────────────────── */
  startBtn.addEventListener('click', async () => {
    splash.classList.add('hidden');
    app.classList.remove('hidden');
    showLoading('Requesting camera access…');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
      });
      webcamEl.srcObject = stream;
      await new Promise(r => webcamEl.onloadedmetadata = r);
      webcamEl.play();

      resizeCanvases();
      DrawEngine.init(drawCanvas);
      applyMirror();

      showLoading('Loading AI hand model…');
      initMediaPipe();

    } catch (err) {
      loadingMsg.textContent = '⚠️ Camera access denied. Please allow camera and reload.';
      console.error(err);
    }
  });

  window.addEventListener('resize', () => {
    resizeCanvases();
  });

  /* ── MediaPipe Hands ─────────────────────────────────────────────── */
  function initMediaPipe() {
    const hands = new Hands({
      locateFile: file =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });

    hands.setOptions({
      maxNumHands:             1,
      modelComplexity:         1,
      minDetectionConfidence:  0.75,
      minTrackingConfidence:   0.70,
    });

    hands.onResults(onResults);

    const camera = new Camera(webcamEl, {
      onFrame: async () => { await hands.send({ image: webcamEl }); },
      width: 1280, height: 720,
    });

    camera.start().then(() => {
      hideLoading();
    }).catch(err => {
      loadingMsg.textContent = '⚠️ Could not start hand tracking. ' + err.message;
      console.error(err);
    });
  }

  /* ── onResults callback ──────────────────────────────────────────── */
  function onResults(results) {
    updateFPS();

    const lmCtx = landmarkCanvas.getContext('2d');
    lmCtx.clearRect(0, 0, landmarkCanvas.width, landmarkCanvas.height);

    if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
      handStatus.textContent  = 'Not found';
      gestureStatus.textContent = '–';
      cursorDot.style.display = 'none';
      DrawEngine.endStroke();
      currentGesture = 'none';
      return;
    }

    handStatus.textContent = '✅ Detected';
    const landmarks = results.multiHandLandmarks[0];

    drawLandmarks(lmCtx, landmarks);

    const result = GestureRecognizer.recognize(landmarks);
    handleGesture(result, landmarks);
  }

  /* ── gesture handler ─────────────────────────────────────────────── */
  function handleGesture(result, landmarks) {
    const { gesture, x, y } = result;

    if (gesture === prevGesture) {
      gestureHoldCount++;
    } else {
      gestureHoldCount = 0;
    }
    prevGesture = gesture;

    if (gestureHoldCount < GESTURE_HOLD && gesture !== 'draw' && gesture !== 'erase') return;

    currentGesture = gesture;
    gestureStatus.textContent = gesture.toUpperCase();

    let cx, cy;
    if (x !== undefined && y !== undefined) {
      cx = mirrored ? (1 - x) * drawCanvas.width  : x * drawCanvas.width;
      cy = y * drawCanvas.height;
    }

    if (cx !== undefined) {
      cursorDot.style.display = 'block';
      cursorDot.style.left    = cx + 'px';
      cursorDot.style.top     = cy + 'px';
    }

    switch (gesture) {

      case 'draw':
        cursorDot.className = 'drawing';
        cursorDot.style.setProperty('--currentColor',       DrawEngine.color);
        cursorDot.style.setProperty('--currentColorShadow', DrawEngine.color + '99');
        DrawEngine.setErase(false);
        if (!DrawEngine.isDrawing) {
          DrawEngine.startStroke(cx, cy);
        } else {
          DrawEngine.continueStroke(cx, cy);
        }
        showGestureIndicator('✏️ Drawing');
        break;

      case 'pause':
        cursorDot.className = '';
        DrawEngine.endStroke();
        showGestureIndicator('✌️ Pen Up');
        break;

      case 'erase':
        cursorDot.className = 'erasing';
        DrawEngine.setErase(true);
        if (!DrawEngine.isDrawing) {
          DrawEngine.startStroke(cx, cy);
        } else {
          DrawEngine.continueStroke(cx, cy);
        }
        showGestureIndicator('🗑 Erasing');
        break;

      case 'clear':
        clearHoldCount++;
        showGestureIndicator(`🖐 Hold to clear… (${Math.round((clearHoldCount/CLEAR_HOLD)*100)}%)`);
        if (clearHoldCount >= CLEAR_HOLD) {
          DrawEngine.clear();
          clearHoldCount = 0;
          showGestureIndicator('✅ Canvas cleared!');
        }
        DrawEngine.endStroke();
        break;

      case 'none':
      default:
        cursorDot.className = '';
        DrawEngine.endStroke();
        break;
    }

    if (gesture !== 'clear') clearHoldCount = 0;
    if (gesture !== 'draw' && gesture !== 'erase') DrawEngine.endStroke();
  }

  /* ── landmark visualisation ──────────────────────────────────────── */
  function drawLandmarks(lmCtx, landmarks) {
    const W = landmarkCanvas.width;
    const H = landmarkCanvas.height;

    const pts = landmarks.map(lm => ({
      x: (mirrored ? 1 - lm.x : lm.x) * W,
      y: lm.y * H,
    }));

    const CONNECTIONS = [
      [0,1],[1,2],[2,3],[3,4],
      [0,5],[5,6],[6,7],[7,8],
      [5,9],[9,10],[10,11],[11,12],
      [9,13],[13,14],[14,15],[15,16],
      [13,17],[17,18],[18,19],[19,20],
      [0,17],[0,5],
    ];

    lmCtx.save();
    lmCtx.strokeStyle = 'rgba(255,255,255,0.4)';
    lmCtx.lineWidth   = 1.5;
    for (const [a, b] of CONNECTIONS) {
      lmCtx.beginPath();
      lmCtx.moveTo(pts[a].x, pts[a].y);
      lmCtx.lineTo(pts[b].x, pts[b].y);
      lmCtx.stroke();
    }

    for (let i = 0; i < pts.length; i++) {
      const isTip = [4, 8, 12, 16, 20].includes(i);
      lmCtx.beginPath();
      lmCtx.arc(pts[i].x, pts[i].y, isTip ? 5 : 3, 0, Math.PI * 2);
      lmCtx.fillStyle = isTip ? '#e94560' : 'rgba(255,255,255,0.6)';
      lmCtx.fill();
    }
    lmCtx.restore();
  }

  /* ── gesture indicator ────────────────────────────────────────────── */
  function showGestureIndicator(text) {
    gestureIndicator.textContent = text;
    gestureIndicator.classList.add('visible');
    clearTimeout(gIndicatorTimer);
    gIndicatorTimer = setTimeout(() => gestureIndicator.classList.remove('visible'), 1500);
  }

  /* ── FPS ──────────────────────────────────────────────────────────── */
  function updateFPS() {
    frameCount++;
    const now = performance.now();
    if (now - lastFpsTime >= 1000) {
      fps = frameCount;
      frameCount = 0;
      lastFpsTime = now;
      fpsDisplay.textContent = fps + ' fps';
    }
  }

  /* ── mirror ───────────────────────────────────────────────────────── */
  function applyMirror() {
    const tf = mirrored ? 'scaleX(-1)' : 'scaleX(1)';
    webcamEl.style.transform = tf;
    landmarkCanvas.style.transform = tf;
  }

  mirrorBtn.addEventListener('click', () => {
    mirrored = !mirrored;
    applyMirror();
    mirrorBtn.textContent = mirrored ? '🔄 Mirror ON' : '🔄 Mirror OFF';
  });

  /* ── toolbar bindings ─────────────────────────────────────────────── */

  colorBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      colorBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      DrawEngine.setColor(btn.dataset.color);
      customColor.value = btn.dataset.color;
    });
  });

  customColor.addEventListener('input', () => {
    colorBtns.forEach(b => b.classList.remove('active'));
    DrawEngine.setColor(customColor.value);
  });

  brushSizeSlider.addEventListener('input', () => {
    brushSizeVal.textContent = brushSizeSlider.value;
    DrawEngine.setSize(brushSizeSlider.value);
  });

  styleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      styleBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      DrawEngine.setStyle(btn.dataset.style);
    });
  });

  opacitySlider.addEventListener('input', () => {
    opacityVal.textContent = opacitySlider.value;
    DrawEngine.setOpacity(opacitySlider.value);
  });

  undoBtn.addEventListener('click', () => DrawEngine.undo());
  clearBtn.addEventListener('click', () => DrawEngine.clear());
  saveBtn.addEventListener('click', () => DrawEngine.save());

  document.addEventListener('keydown', e => {
    if (e.ctrlKey && e.key === 'z') DrawEngine.undo();
    if (e.key === 'Delete' || e.key === 'Backspace') DrawEngine.clear();
  });

  /* ── loading helpers ──────────────────────────────────────────────── */
  function showLoading(msg) {
    loadingMsg.textContent = msg || 'Loading…';
    loadingOverlay.classList.remove('hidden');
  }

  function hideLoading() {
    loadingOverlay.classList.add('hidden');
  }

})();
