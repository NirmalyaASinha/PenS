const { ipcRenderer } = require('electron');

if (process.isMainFrame) {
  window.addEventListener('focusin', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;
    const type = String(target.type || '').toLowerCase();
    if (['password', 'hidden', 'file'].includes(type)) return;
    ipcRenderer.sendToHost('personal-details-request', {
      origin: window.location.origin,
      field: target.name || target.id || target.autocomplete || '',
      type
    });
  }, true);
}

ipcRenderer.on('fill-personal-details', (_event, details) => {
  if (!process.isMainFrame || !details) return;
  const active = document.activeElement;
  if (!(active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement)) return;
  const key = `${active.name || ''} ${active.id || ''} ${active.autocomplete || ''}`.toLowerCase();
  let value = '';
  if (/email/.test(key)) value = details.email || '';
  else if (/phone|tel/.test(key)) value = details.phone || '';
  else if (/address|street|city|postal|zip|country/.test(key)) value = details.address || '';
  else value = details.name || '';
  if (!value) return;
  const prototype = active instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (setter) setter.call(active, value);
  active.dispatchEvent(new Event('input', { bubbles: true }));
  active.dispatchEvent(new Event('change', { bubbles: true }));
});

let canvas, activeCanvas, ctx, activeCtx;
let strokes = [], undoneStrokes = [], currentStroke = null;
let mode = 'browse', isEraser = false;
let color = '#1a73e8', lineWidth = 2.5, opacity = 1;

let isPanning = false, panStart = { x: 0, y: 0 };
let spaceDown = false;

window.addEventListener('keydown', (e) => { if (e.code === 'Space' && document.activeElement.tagName !== 'INPUT') spaceDown = true; });
window.addEventListener('keyup', (e) => { if (e.code === 'Space') spaceDown = false; });
window.addEventListener('pointermove', (e) => ipcRenderer.sendToHost('pointer-activity', { type: e.pointerType, pressure: e.pressure, buttons: e.buttons, isMove: true }), true);
window.addEventListener('pointerdown', (e) => ipcRenderer.sendToHost('pointer-activity', { type: e.pointerType, pressure: e.pressure, buttons: e.buttons, isMove: false }), true);
window.addEventListener('pointerleave', (e) => ipcRenderer.sendToHost('pointer-leave', { type: e.pointerType }), true);
window.addEventListener('contextmenu', (e) => { if (mode === 'pen' && e.pointerType === 'pen') e.preventDefault(); }, true);

function updateCursor() {
  if (!activeCanvas) return;
  if (mode !== 'pen' || isPanning) { activeCanvas.style.cursor = 'default'; return; }
  const s = Math.max(4, lineWidth * (canvas.width / 1000) * 2);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}"><circle cx="${s/2}" cy="${s/2}" r="${s/2 - 1}" fill="${encodeURIComponent(color)}" stroke="white" stroke-width="1" opacity="0.8"/></svg>`;
  activeCanvas.style.cursor = `url('data:image/svg+xml;utf8,${svg}') ${s/2} ${s/2}, crosshair`;
}

function initCanvas() {
  if (document.querySelector('div[style*="2147483647"]')) return;
  const host = document.createElement('div');
  
  host.style.position = 'absolute';
  host.style.top = '0';
  host.style.left = '0';
  host.style.width = '100%';
  host.style.height = '100%';
  host.style.pointerEvents = 'none';
  host.style.zIndex = '2147483647';
  document.documentElement.appendChild(host);
  
  // Create a closed shadow root so page JS cannot access the canvas
  const shadow = host.attachShadow({ mode: 'closed' });

  canvas = document.createElement('canvas');
  activeCanvas = document.createElement('canvas');
  
  [canvas, activeCanvas].forEach(c => {
    c.style.position = 'absolute'; c.style.top = '0'; c.style.left = '0';
    c.style.pointerEvents = 'none';
    c.style.touchAction = 'none'; // Prevent Windows Ink scrolling!
    shadow.appendChild(c);
  });
  
  updateCanvasSize();
  ctx = canvas.getContext('2d', { desynchronized: true });
  activeCtx = activeCanvas.getContext('2d', { desynchronized: true });
  
  activeCanvas.addEventListener('pointerdown', onPointerDown);
  activeCanvas.addEventListener('pointermove', onPointerMove);
  activeCanvas.addEventListener('pointerup', onPointerUp);
  
  new ResizeObserver(() => updateCanvasSize()).observe(document.body);
  updateCursor();
}

function updateCanvasSize() {
  if (!canvas) return;
  const w = Math.max(document.body.scrollWidth, document.documentElement.scrollWidth, window.innerWidth);
  const h = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, window.innerHeight);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w; canvas.height = h; activeCanvas.width = w; activeCanvas.height = h; render(); updateCursor();
  }
}

function getPointerPos(e) {
  const rect = activeCanvas.getBoundingClientRect();
  return { x: (e.clientX - rect.left) / canvas.width, y: (e.clientY - rect.top) / canvas.height, pressure: e.pressure !== 0 ? e.pressure : 0.5 };
}

function onPointerDown(e) {
  if (mode !== 'pen' || e.pointerType === 'touch') return;
  if (e.buttons === 0 && e.pressure === 0) return; // Prevent start if strictly hovering
  if (e.pointerType === 'pen') e.preventDefault(); // Stop native drag/scroll
  if (spaceDown) {
    isPanning = true; panStart = { x: e.screenX, y: e.screenY, scrollX: window.scrollX, scrollY: window.scrollY };
    activeCanvas.setPointerCapture(e.pointerId); updateCursor(); return;
  }
  activeCanvas.setPointerCapture(e.pointerId);
  const pos = getPointerPos(e);
  if (isEraser || (e.buttons & 32)) {
    eraseAt(pos); activeCanvas.isErasingNow = true;
  } else {
    activeCanvas.isErasingNow = false;
    currentStroke = { tool: currentTool, color, opacity, width: lineWidth, points: [[pos.x, pos.y, pos.pressure]] };
    undoneStrokes = [];
  }
}

function onPointerMove(e) {
  if (isPanning) { window.scrollTo(panStart.scrollX - (e.screenX - panStart.x), panStart.scrollY - (e.screenY - panStart.y)); return; }
  if (mode !== 'pen') return;
  
  // Force end stroke if we are hovering (missed pointerup)
  if ((currentStroke || activeCanvas.isErasingNow) && e.buttons === 0 && (e.pointerType !== 'pen' || e.pressure === 0)) {
    onPointerUp(e);
    return;
  }

  if (activeCanvas.isErasingNow) return eraseAt(getPointerPos(e));
  if (!currentStroke) return;

  const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
  for (const ev of events) {
    currentStroke.points.push([getPointerPos(ev).x, getPointerPos(ev).y, ev.pressure]);
  }
  
  activeCtx.clearRect(0, 0, canvas.width, canvas.height);
  drawStroke(activeCtx, currentStroke);
}

function onPointerUp(e) {
  if (isPanning) { isPanning = false; activeCanvas.releasePointerCapture(e.pointerId); updateCursor(); return; }
  if (mode !== 'pen') return;
  activeCanvas.releasePointerCapture(e.pointerId); activeCanvas.isErasingNow = false;
  if (currentStroke && currentStroke.points.length > 1) {
    strokes.push(currentStroke); currentStroke = null;
    activeCtx.clearRect(0, 0, canvas.width, canvas.height); render(); autoSave();
  } else currentStroke = null;
}

function eraseAt(pos) {
  let erased = false;
  strokes = strokes.filter(s => {
    const hit = s.points.some(p => Math.sqrt(Math.pow(p[0]-pos.x, 2) + Math.pow(p[1]-pos.y, 2)) < 0.02);
    if (hit) erased = true; return !hit;
  });
  if (erased) { render(); autoSave(); }
}

function drawStroke(targetCtx, stroke) {
  if (stroke.points.length < 2) return;
  targetCtx.strokeStyle = stroke.color; 
  targetCtx.lineCap = 'round'; 
  targetCtx.lineJoin = 'round';
  
  if (stroke.tool === 'highlighter') {
    // Convert hex to rgba for highlighter, or use multiply
    targetCtx.globalCompositeOperation = 'multiply';
    targetCtx.globalAlpha = 0.5 * (stroke.opacity ?? 1);
  } else {
    targetCtx.globalCompositeOperation = 'source-over';
    targetCtx.globalAlpha = stroke.opacity ?? 1;
  }

  for (let i = 1; i < stroke.points.length; i++) {
    const p1 = stroke.points[i-1], p2 = stroke.points[i];
    targetCtx.lineWidth = stroke.width * ((p1[2] + p2[2])/2) * (canvas.width / 1000);
    targetCtx.beginPath();
    targetCtx.moveTo(p1[0] * canvas.width, p1[1] * canvas.height);
    targetCtx.lineTo(p2[0] * canvas.width, p2[1] * canvas.height);
    targetCtx.stroke();
  }
  
  // Reset for next drawing if needed
  targetCtx.globalCompositeOperation = 'source-over';
  targetCtx.globalAlpha = 1.0;
}

function render() {
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const s of strokes) drawStroke(ctx, s);
}

function getThumbnail() {
  if (strokes.length === 0) return '';
  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = 300;
  const aspectRatio = Math.min(canvas.height / canvas.width, 1.5);
  thumbCanvas.height = 300 * aspectRatio;
  const tCtx = thumbCanvas.getContext('2d');
  tCtx.fillStyle = '#ffffff';
  tCtx.fillRect(0, 0, thumbCanvas.width, thumbCanvas.height);
  tCtx.drawImage(canvas, 0, 0, canvas.width, canvas.width * aspectRatio, 0, 0, thumbCanvas.width, thumbCanvas.height);
  return thumbCanvas.toDataURL('image/jpeg', 0.5);
}

let thumbnailTimeout = null;
function autoSave() {
  ipcRenderer.sendToHost('save-strokes', { strokes });
  clearTimeout(thumbnailTimeout);
  thumbnailTimeout = setTimeout(() => {
    ipcRenderer.sendToHost('save-strokes', { strokes, thumbnail: getThumbnail() });
  }, 2000);
}

let currentTool = 'pen';
ipcRenderer.on('set-mode', (e, newMode) => { mode = newMode; if (activeCanvas) activeCanvas.style.pointerEvents = mode === 'pen' ? 'auto' : 'none'; updateCursor(); });
ipcRenderer.on('set-eraser', (e, active) => isEraser = active);
ipcRenderer.on('undo', () => { if (strokes.length > 0) { undoneStrokes.push(strokes.pop()); render(); autoSave(); } });
ipcRenderer.on('redo', () => { if (undoneStrokes.length > 0) { strokes.push(undoneStrokes.pop()); render(); autoSave(); } });
ipcRenderer.on('clear-strokes', () => { if (strokes.length > 0) { undoneStrokes = [...strokes]; strokes = []; render(); autoSave(); } });
ipcRenderer.on('load-strokes', (e, data) => { if (data && data.strokes) { strokes = data.strokes; render(); } });
ipcRenderer.on('set-style', (e, style) => { color = style.color; lineWidth = style.size; opacity = style.opacity ?? 1; currentTool = style.tool || 'pen'; updateCursor(); });

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initCanvas); else initCanvas();
