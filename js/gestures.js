/**
 * gestures.js — Hand gesture recognition with improved accuracy
 * Analyses MediaPipe Hands landmarks and returns a gesture string.
 *
 * Gesture catalogue:
 *   "draw"   – index finger up, others curled  → draw / paint
 *   "pause"  – index + middle up               → lift pen (no drawing)
 *   "erase"  – thumb + index pinch             → erase
 *   "clear"  – all five fingers open           → clear canvas
 *   "none"   – hand not in any recognised pose
 *
 * Enhanced with stricter thresholds for better accuracy
 */

window.GestureRecognizer = (function () {

  /* ── helpers ─────────────────────────────────────────────────────── */

  /**
   * Returns true if a finger is "up" (tip above the PIP joint).
   * Landmark indices:
   *   thumb  tip=4  ip=3
   *   index  tip=8  pip=6
   *   middle tip=12 pip=10
   *   ring   tip=16 pip=14
   *   pinky  tip=20 pip=18
   */
  function isFingerUp(lm, tip, pip) {
    return lm[tip].y < lm[pip].y;
  }

  function isThumbUp(lm) {
    const wrist    = lm[0];
    const thumbTip = lm[4];
    const thumbIP  = lm[3];
    const dTip = Math.hypot(thumbTip.x - wrist.x, thumbTip.y - wrist.y);
    const dIP  = Math.hypot(thumbIP.x  - wrist.x, thumbIP.y  - wrist.y);
    return dTip > dIP * 1.15; // Improved threshold for better accuracy
  }

  function dist2D(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  /* ── main recogniser ─────────────────────────────────────────────── */

  function recognize(landmarks) {
    if (!landmarks || landmarks.length < 21) return { gesture: 'none' };

    const lm = landmarks;

    const indexUp  = isFingerUp(lm, 8,  6);
    const middleUp = isFingerUp(lm, 12, 10);
    const ringUp   = isFingerUp(lm, 16, 14);
    const pinkyUp  = isFingerUp(lm, 20, 18);
    const thumbExt = isThumbUp(lm);

    // ── All five fingers open → CLEAR ─────────────────────────────
    if (indexUp && middleUp && ringUp && pinkyUp && thumbExt) {
      return { gesture: 'clear' };
    }

    // ── Pinch (thumb tip ↔ index tip very close) → ERASE ─────────
    // Improved threshold from 0.06 to 0.055 for stricter detection
    const pinchDist = dist2D(lm[4], lm[8]);
    if (pinchDist < 0.055 && !middleUp && !ringUp && !pinkyUp) {
      return { gesture: 'erase', x: lm[8].x, y: lm[8].y };
    }

    // ── Index + Middle up (peace sign) → PAUSE ───────────────────
    if (indexUp && middleUp && !ringUp && !pinkyUp) {
      return { gesture: 'pause', x: lm[8].x, y: lm[8].y };
    }

    // ── Only index up → DRAW ──────────────────────────────────────
    if (indexUp && !middleUp && !ringUp && !pinkyUp) {
      return { gesture: 'draw', x: lm[8].x, y: lm[8].y };
    }

    return { gesture: 'none', x: lm[8].x, y: lm[8].y };
  }

  return { recognize };
})();
