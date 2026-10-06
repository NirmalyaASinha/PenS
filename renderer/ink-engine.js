class InkEngine {
  constructor(container, sourceId) {
    this.container = container;
    this.sourceId = sourceId;
    
    // Base committed canvas
    this.canvas = document.createElement('canvas');
    // Active drawing canvas (for zero latency smoothing)
    this.activeCanvas = document.createElement('canvas');
    
    [this.canvas, this.activeCanvas].forEach(c => {
      c.style.position = 'absolute';
      c.style.top = '0'; c.style.left = '0';
      c.style.pointerEvents = 'none';
      c.style.touchAction = 'none'; // Prevent Windows Ink scrolling!
      container.appendChild(c);
    });

    this.ctx = this.canvas.getContext('2d', { desynchronized: true });
    this.activeCtx = this.activeCanvas.getContext('2d', { desynchronized: true });
    
    this.width = container.clientWidth;
    this.height = container.clientHeight;
    this.canvas.width = this.width; this.canvas.height = this.height;
    this.activeCanvas.width = this.width; this.activeCanvas.height = this.height;
    
    this.strokes = []; this.undoneStrokes = []; this.currentStroke = null;
    this.color = '#1a73e8'; this.lineWidth = 2.5;
    this.isEraser = false; this.mode = 'browse';
    this.isPanning = false; this.panStart = { x: 0, y: 0 };
    this.spaceDown = false;
    
    window.addEventListener('keydown', (e) => { if (e.code === 'Space' && document.activeElement.tagName !== 'INPUT') this.spaceDown = true; });
    window.addEventListener('keyup', (e) => { if (e.code === 'Space') this.spaceDown = false; });

    this.setupEvents();
    this.load();
    this.updateCursor();
  }

  updateCursor() {
    if (this.mode !== 'pen' || this.isPanning) {
      this.activeCanvas.style.cursor = 'default';
      return;
    }
    // Generate native zero-latency SVG cursor
    const s = Math.max(4, this.lineWidth * (this.width / 1000) * 2);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}"><circle cx="${s/2}" cy="${s/2}" r="${s/2 - 1}" fill="${encodeURIComponent(this.color)}" stroke="white" stroke-width="1" opacity="0.8"/></svg>`;
    this.activeCanvas.style.cursor = `url('data:image/svg+xml;utf8,${svg}') ${s/2} ${s/2}, crosshair`;
  }

  setMode(mode) {
    this.mode = mode;
    this.activeCanvas.style.pointerEvents = mode === 'pen' ? 'auto' : 'none';
    this.updateCursor();
  }

  setEraser(active) { this.isEraser = active; }

  setupEvents() {
    window.addEventListener('pointermove', (e) => window.handlePointerActivity?.({ type: e.pointerType, pressure: e.pressure, buttons: e.buttons, isMove: true }), true);
    window.addEventListener('pointerleave', (e) => window.handlePointerLeave?.({ type: e.pointerType }), true);
    this.activeCanvas.addEventListener('pointerdown', this.onPointerDown.bind(this));
    this.activeCanvas.addEventListener('pointermove', this.onPointerMove.bind(this));
    this.activeCanvas.addEventListener('pointerup', this.onPointerUp.bind(this));
  }

  getPointerPos(e) {
    const rect = this.activeCanvas.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height, pressure: e.pressure !== 0 ? e.pressure : 0.5 };
  }

  onPointerDown(e) {
    window.handlePointerActivity?.({ type: e.pointerType, pressure: e.pressure, buttons: e.buttons, isMove: false });
    if (this.mode !== 'pen' || e.pointerType === 'touch') return;
    if (e.buttons === 0 && e.pressure === 0) return; // Prevent start if strictly hovering
    if (e.pointerType === 'pen') e.preventDefault(); // Stop native drag/scroll
    
    if (this.spaceDown) {
      this.isPanning = true;
      this.panStart = { y: e.clientY, scrollY: this.container.parentElement.scrollTop };
      this.activeCanvas.setPointerCapture(e.pointerId);
      this.updateCursor();
      return;
    }
    this.activeCanvas.setPointerCapture(e.pointerId);
    const pos = this.getPointerPos(e);
    if (this.isEraser || (e.buttons & 32)) {
      this.eraseAt(pos); this.isErasingNow = true;
    } else {
      this.isErasingNow = false;
      this.currentStroke = { tool: this.tool || 'pen', color: this.color, width: this.lineWidth, points: [[pos.x, pos.y, pos.pressure]] };
      this.undoneStrokes = [];
    }
  }

  onPointerMove(e) {
    if (this.isPanning) { this.container.parentElement.scrollTop = this.panStart.scrollY - (e.clientY - this.panStart.y); return; }
    if (this.mode !== 'pen') return;
    
    // Force end stroke if we are hovering (missed pointerup)
    if ((this.currentStroke || this.isErasingNow) && e.buttons === 0 && (e.pointerType !== 'pen' || e.pressure === 0)) {
      this.onPointerUp(e);
      return;
    }

    if (this.isErasingNow) return this.eraseAt(this.getPointerPos(e));
    if (!this.currentStroke) return;

    const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of events) {
      this.currentStroke.points.push([this.getPointerPos(ev).x, this.getPointerPos(ev).y, ev.pressure]);
    }
    
    // Fast render on active layer
    this.activeCtx.clearRect(0, 0, this.width, this.height);
    this.drawStroke(this.activeCtx, this.currentStroke);
  }

  onPointerUp(e) {
    if (this.isPanning) { this.isPanning = false; this.activeCanvas.releasePointerCapture(e.pointerId); this.updateCursor(); return; }
    if (this.mode !== 'pen') return;
    this.activeCanvas.releasePointerCapture(e.pointerId);
    this.isErasingNow = false;
    
    if (this.currentStroke && this.currentStroke.points.length > 1) {
      this.strokes.push(this.currentStroke);
      this.currentStroke = null;
      this.activeCtx.clearRect(0, 0, this.width, this.height);
      this.render();
      this.autoSave();
    } else this.currentStroke = null;
  }

  eraseAt(pos) {
    let erased = false;
    this.strokes = this.strokes.filter(s => {
      const hit = s.points.some(p => Math.sqrt(Math.pow(p[0]-pos.x, 2) + Math.pow(p[1]-pos.y, 2)) < 0.02);
      if (hit) erased = true; return !hit;
    });
    if (erased) { this.render(); this.autoSave(); }
  }

  undo() { if (this.strokes.length > 0) { this.undoneStrokes.push(this.strokes.pop()); this.render(); this.autoSave(); } }
  redo() { if (this.undoneStrokes.length > 0) { this.strokes.push(this.undoneStrokes.pop()); this.render(); this.autoSave(); } }
  clear() { if (this.strokes.length > 0) { this.undoneStrokes = [...this.strokes]; this.strokes = []; this.render(); this.autoSave(); } }

  drawStroke(ctx, stroke) {
    if (stroke.points.length < 2) return;
    ctx.strokeStyle = stroke.color; 
    ctx.lineCap = 'round'; 
    ctx.lineJoin = 'round';

    if (stroke.tool === 'highlighter') {
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = 0.5;
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1.0;
    }

    for (let i = 1; i < stroke.points.length; i++) {
      const p1 = stroke.points[i-1], p2 = stroke.points[i];
      ctx.lineWidth = stroke.width * ((p1[2] + p2[2])/2) * (this.width / 1000);
      ctx.beginPath();
      ctx.moveTo(p1[0] * this.width, p1[1] * this.height);
      ctx.lineTo(p2[0] * this.width, p2[1] * this.height);
      ctx.stroke();
    }
    
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1.0;
  }

  render() {
    this.ctx.clearRect(0, 0, this.width, this.height);
    for (const stroke of this.strokes) this.drawStroke(this.ctx, stroke);
  }

  getThumbnail() {
    if (this.strokes.length === 0) return '';
    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = 300;
    const aspectRatio = Math.min(this.height / this.width, 1.5);
    thumbCanvas.height = 300 * aspectRatio;
    const tCtx = thumbCanvas.getContext('2d');
    tCtx.fillStyle = '#ffffff';
    tCtx.fillRect(0, 0, thumbCanvas.width, thumbCanvas.height);
    tCtx.drawImage(this.canvas, 0, 0, this.width, this.width * aspectRatio, 0, 0, thumbCanvas.width, thumbCanvas.height);
    return thumbCanvas.toDataURL('image/jpeg', 0.5);
  }

  async autoSave() { 
    await window.electronAPI.saveNotes(this.sourceId, { 
      version: 1, 
      source: { type: 'pdf', id: this.sourceId }, 
      strokes: this.strokes
    }); 
    
    if (this.thumbnailTimeout) clearTimeout(this.thumbnailTimeout);
    this.thumbnailTimeout = setTimeout(async () => {
      await window.electronAPI.saveNotes(this.sourceId, { 
        version: 1, 
        source: { type: 'pdf', id: this.sourceId }, 
        strokes: this.strokes,
        thumbnail: this.getThumbnail()
      }); 
    }, 2000);
  }
  async load() {
    const data = await window.electronAPI.loadNotes(this.sourceId);
    if (data && data.strokes) { this.strokes = data.strokes; this.render(); }
  }
}
window.addEventListener('contextmenu', (e) => { if (e.target.tagName === 'CANVAS' && window.effectiveMode === 'pen') e.preventDefault(); });
window.InkEngine = InkEngine;
