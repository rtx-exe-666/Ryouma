/**
 * drawing.js — Canvas drawing engine
 * Supports: round, square, spray, neon brush styles.
 * Enhanced with KULDEEP watermark
 * Exposes DrawEngine that app.js uses.
 */

window.DrawEngine = (function () {

  let canvas, ctx;
  let brushColor   = '#FF3B3B';
  let brushSize    = 8;
  let brushStyle   = 'round';   // round | square | spray | neon
  let opacity      = 1.0;
  let eraseMode    = false;
  let isDrawing    = false;
  let lastX        = null;
  let lastY        = null;

  // Undo stack – stores ImageData snapshots
  const undoStack  = [];
  const MAX_UNDO   = 30;

  /* ── init ──────────────────────────────────────────────────────── */
  function init(canvasEl) {
    canvas = canvasEl;
    ctx    = canvas.getContext('2d');
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
  }

  /* ── watermark drawing ──────────────────────────────────────────── */
  function drawWatermark() {
    if (!ctx || !canvas) return;
    
    ctx.save();
    ctx.font = 'bold 24px Arial, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    
    // Draw watermark in bottom-right corner
    const padding = 16;
    const x = canvas.width - padding;
    const y = canvas.height - padding;
    
    ctx.fillText('KULDEEP', x, y);
    ctx.restore();
  }

  /* ── undo helpers ────────────────────────────────────────────────── */
  function saveState() {
    if (undoStack.length >= MAX_UNDO) undoStack.shift();
    undoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
  }

  function undo() {
    if (undoStack.length === 0) return;
    const snap = undoStack.pop();
    ctx.putImageData(snap, 0, 0);
    drawWatermark(); // Redraw watermark after undo
  }

  /* ── clear ────────────────────────────────────────────────────────── */
  function clear() {
    saveState();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawWatermark(); // Redraw watermark after clear
  }

  /* ── core draw ────────────────────────────────────────────────────── */
  function drawPoint(x, y) {
    if (eraseMode) {
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(x, y, brushSize * 2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,1)';
      ctx.fill();
      ctx.restore();
      return;
    }

    ctx.save();
    ctx.globalAlpha = opacity;

    if (brushStyle === 'neon') {
      ctx.shadowColor  = brushColor;
      ctx.shadowBlur   = brushSize * 2.5;
      ctx.strokeStyle  = '#fff';
      ctx.lineWidth    = brushSize * 0.4;
      if (lastX !== null) {
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
      ctx.shadowBlur   = brushSize * 5;
      ctx.strokeStyle  = brushColor;
      ctx.lineWidth    = brushSize * 0.8;
      if (lastX !== null) {
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(x, y);
        ctx.stroke();
      }

    } else if (brushStyle === 'spray') {
      const density = Math.floor(brushSize * 4);
      for (let i = 0; i < density; i++) {
        const angle  = Math.random() * Math.PI * 2;
        const radius = Math.random() * brushSize * 1.5;
        const sx = x + Math.cos(angle) * radius;
        const sy = y + Math.sin(angle) * radius;
        ctx.fillStyle = brushColor;
        ctx.fillRect(sx, sy, 1.5, 1.5);
      }

    } else {
      ctx.strokeStyle = brushColor;
      ctx.lineWidth   = brushSize;
      ctx.lineCap     = brushStyle === 'square' ? 'square' : 'round';
      ctx.lineJoin    = brushStyle === 'square' ? 'miter'  : 'round';

      if (lastX !== null) {
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(x, y);
        ctx.stroke();
      } else {
        ctx.beginPath();
        if (brushStyle === 'square') {
          ctx.fillStyle = brushColor;
          ctx.fillRect(x - brushSize/2, y - brushSize/2, brushSize, brushSize);
        } else {
          ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
          ctx.fillStyle = brushColor;
          ctx.fill();
        }
      }
    }

    ctx.restore();
  }

  /* ── public API ─────────────────────────────────────────────────────── */

  function startStroke(x, y) {
    if (!isDrawing) saveState();
    isDrawing = true;
    lastX = null; lastY = null;
    drawPoint(x, y);
    lastX = x; lastY = y;
  }

  function continueStroke(x, y) {
    if (!isDrawing) return;
    drawPoint(x, y);
    lastX = x; lastY = y;
  }

  function endStroke() {
    isDrawing = false;
    lastX = null; lastY = null;
  }

  function setColor(c)   { brushColor = c; eraseMode = false; }
  function setSize(s)    { brushSize  = parseInt(s, 10); }
  function setStyle(s)   { brushStyle = s; }
  function setOpacity(o) { opacity    = o / 100; }
  function setErase(on)  { eraseMode  = on; }

  function save() {
    const link = document.createElement('a');
    link.download = `airdraw_${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  function resize(w, h) {
    const snap = ctx.getImageData(0, 0, canvas.width, canvas.height);
    canvas.width  = w;
    canvas.height = h;
    ctx.putImageData(snap, 0, 0);
    ctx.lineCap  = 'round';
    ctx.lineJoin = 'round';
    drawWatermark(); // Redraw watermark after resize
  }

  return {
    init,
    startStroke, continueStroke, endStroke,
    setColor, setSize, setStyle, setOpacity, setErase,
    clear, undo, save, resize,
    drawWatermark, // Expose watermark function
    get isDrawing() { return isDrawing; },
    get color()     { return brushColor; },
  };

})();
