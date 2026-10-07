class PDFViewer {
  constructor(container, filePath, fileUrl) {
    this.container = container;
    this.filePath = filePath || fileUrl;
    this.fileUrl = fileUrl || filePath;
    this.scale = 1.5;
    this.renderedScale = 1.5;
    this.pdfDoc = null;
    this.pages = new Map();
    this.engines = [];
    this.annotations = [];
    this.textToolEnabled = false;
    this.performanceMode = false;
    this.renderGeneration = 0;
    this.renderTimers = new Map();
    this.intersectionObserver = null;

    this.container.style.overflowY = 'auto';
    this.container.style.backgroundColor = '#525659';
    this.container.style.display = 'flex';
    this.container.style.flexDirection = 'column';
    this.container.style.alignItems = 'center';
    this.container.style.padding = '20px 0';
    this.container.style.height = '100%';
    this.container.addEventListener('scroll', () => this.renderVisiblePages(), { passive: true });

    this.ready = this.loadPDF();
  }

  async loadPDF() {
    const generation = ++this.renderGeneration;
    this.cancelRenders();
    try {
      this.container.replaceChildren(this.message('Loading PDF...'));
      let docInitParams = null;
      if (window.electronAPI?.readPdf) {
        const result = await window.electronAPI.readPdf(this.filePath);
        if (result?.error) throw new Error(result.error);
        let uint8;
        if (result instanceof Uint8Array) uint8 = result;
        else if (result instanceof ArrayBuffer) uint8 = new Uint8Array(result);
        else if (result?.type === 'Buffer' && Array.isArray(result.data)) uint8 = Uint8Array.from(result.data);
        else if (result?.data instanceof ArrayBuffer) uint8 = new Uint8Array(result.data);
        if (!uint8) throw new Error('The selected PDF could not be read.');
        docInitParams = { data: uint8, isEvalSupported: false, enableScripting: false };
      }
      if (!docInitParams) docInitParams = { url: this.fileUrl, isEvalSupported: false, enableScripting: false };

      let attempts = 0;
      while (!window.pdfjsLib && attempts++ < 50) await new Promise(resolve => setTimeout(resolve, 100));
      if (!window.pdfjsLib) throw new Error('PDF.js library is not ready or failed to load.');
      const loadingTask = window.pdfjsLib.getDocument(docInitParams);
      this.pdfDoc = await loadingTask.promise;
      if (generation !== this.renderGeneration) return;

      this.pages.clear();
      this.engines = [];
      this.container.replaceChildren();
      await this.createPagePlaceholders();
      this.intersectionObserver?.disconnect();
      this.intersectionObserver = new IntersectionObserver(() => this.renderVisiblePages(), {
        root: this.container,
        rootMargin: '120% 0px'
      });
      this.pages.forEach(record => this.intersectionObserver.observe(record.container));
      this.renderVisiblePages();
    } catch (error) {
      if (generation !== this.renderGeneration) return;
      console.error('Error loading PDF:', error);
      this.container.replaceChildren(this.message(`Error loading PDF: ${error.message}`, true));
    }
  }

  message(text, error = false) {
    const node = document.createElement('div');
    node.style.cssText = `color:${error ? '#f28b82' : '#e8eaed'}; padding:40px; font-family:'Segoe UI',sans-serif; text-align:center;`;
    node.textContent = text;
    return node;
  }

  async createPagePlaceholders() {
    for (let pageNum = 1; pageNum <= this.pdfDoc.numPages; pageNum++) {
      const page = await this.pdfDoc.getPage(pageNum);
      const baseViewport = page.getViewport({ scale: this.scale });
      const pageContainer = document.createElement('div');
      pageContainer.dataset.pageNumber = String(pageNum);
      pageContainer.style.cssText = `position:relative; margin-bottom:20px; width:${baseViewport.width}px; height:${baseViewport.height}px; background:#fff; box-shadow:0 4px 8px rgba(0,0,0,.2); flex:none;`;
      this.container.appendChild(pageContainer);
      this.pages.set(pageNum, {
        page,
        container: pageContainer,
        viewport: baseViewport,
        renderedScale: 0,
        renderTask: null,
        engine: null
      });
    }
  }

  renderVisiblePages() {
    if (!this.pdfDoc) return;
    const viewTop = this.container.scrollTop;
    const viewBottom = viewTop + this.container.clientHeight;
    this.pages.forEach((record, pageNum) => {
      const top = record.container.offsetTop;
      const visible = top < viewBottom + record.container.clientHeight * 1.2
        && top + record.container.offsetHeight > viewTop - record.container.clientHeight * 1.2;
      if (visible) this.schedulePageRender(pageNum);
      else this.releasePage(pageNum);
    });
  }

  schedulePageRender(pageNum) {
    const oldTimer = this.renderTimers.get(pageNum);
    if (oldTimer) clearTimeout(oldTimer);
    this.renderTimers.set(pageNum, setTimeout(() => {
      this.renderTimers.delete(pageNum);
      this.renderPage(pageNum, this.renderGeneration).catch(error => {
        if (error?.name !== 'RenderingCancelledException') console.error('Unable to render PDF page:', error);
      });
    }, 0));
  }

  cancelRenders() {
    this.renderTimers.forEach(timer => clearTimeout(timer));
    this.renderTimers.clear();
    this.pages?.forEach(record => record.renderTask?.cancel());
  }

  releasePage(pageNum) {
    const record = this.pages.get(pageNum);
    if (!record || !record.engine) return;
    record.renderTask?.cancel();
    record.renderTask = null;
    record.container.querySelector('.pdf-render-canvas')?.remove();
    record.container.querySelector('.textLayer')?.remove();
    record.renderedScale = 0;
  }

  async renderPage(pageNum, generation) {
    const record = this.pages.get(pageNum);
    if (!record || generation !== this.renderGeneration ||
        (record.renderedScale === this.scale && record.container.querySelector('.pdf-render-canvas'))) return;
    record.renderTask?.cancel();
    const viewport = record.page.getViewport({ scale: this.scale });
    const canvas = record.container.querySelector('.pdf-render-canvas') || document.createElement('canvas');
    canvas.className = 'pdf-render-canvas';
    const outputScale = Math.min(this.performanceMode ? 1 : 2, Math.max(1, window.devicePixelRatio || 1));
    canvas.width = Math.min(4096, Math.ceil(viewport.width * outputScale));
    canvas.height = Math.min(4096, Math.ceil(viewport.height * outputScale));
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    canvas.style.display = 'block';
    if (!canvas.parentNode) record.container.appendChild(canvas);
    const context = canvas.getContext('2d', { alpha: false });
    const renderTask = record.page.render({
      canvasContext: context,
      viewport,
      transform: outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0]
    });
    record.renderTask = renderTask;
    await renderTask.promise;
    if (generation !== this.renderGeneration) return;
    record.renderTask = null;
    record.renderedScale = this.scale;
    record.viewport = viewport;
    record.container.style.width = `${viewport.width}px`;
    record.container.style.height = `${viewport.height}px`;
    record.container.style.transform = '';
    const textLayer = record.container.querySelector('.textLayer');
    textLayer?.remove();
    if (window.pdfjsLib.TextLayer) {
      const textContent = await record.page.getTextContent();
      if (generation !== this.renderGeneration) return;
      const layer = document.createElement('div');
      layer.className = 'textLayer';
      layer.style.cssText = 'position:absolute; inset:0; overflow:hidden; line-height:1; pointer-events:none;';
      record.container.appendChild(layer);
      const textLayerBuilder = new window.pdfjsLib.TextLayer({
        textContentSource: textContent,
        container: layer,
        viewport
      });
      await textLayerBuilder.render();
    }
    if (!record.engine) {
      const sourceId = `${this.fileUrl}_page_${pageNum}`;
      record.engine = new window.InkEngine(record.container, sourceId);
      if (window.effectiveMode) record.engine.setMode(window.effectiveMode);
      if (window.isEraser) record.engine.setEraser(window.isEraser);
      this.engines[pageNum - 1] = record.engine;
      record.container.addEventListener('click', event => this.handlePageClick(event, pageNum));
    }
    this.renderAnnotations();
  }

  handlePageClick(event, pageNum) {
    if (!this.textToolEnabled || event.target.closest('.pdf-text-annotation')) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const text = window.prompt('Enter a comment or text for this PDF page:');
    if (!text?.trim()) return;
    this.annotations.push({
      page: pageNum,
      x: Math.max(0, (event.clientX - rect.left) / rect.width),
      y: Math.max(0, (event.clientY - rect.top) / rect.height),
      text: text.trim()
    });
    this.renderAnnotations();
  }

  setTextTool(enabled) {
    this.textToolEnabled = enabled;
    this.container.classList.toggle('pdf-text-mode', enabled);
  }

  renderAnnotations() {
    this.container.querySelectorAll('.pdf-text-annotation').forEach(node => node.remove());
    this.annotations.forEach(annotation => {
      const page = this.container.querySelector(`[data-page-number="${annotation.page}"]`);
      if (!page) return;
      const node = document.createElement('div');
      node.className = 'pdf-text-annotation';
      node.textContent = annotation.text;
      node.style.left = `${annotation.x * 100}%`;
      node.style.top = `${annotation.y * 100}%`;
      page.appendChild(node);
    });
  }

  setPerformanceMode(enabled) {
    this.performanceMode = Boolean(enabled);
    this.renderGeneration++;
    this.cancelRenders();
    this.pages.forEach(record => {
      record.renderedScale = 0;
      if (record.container) record.container.querySelector('canvas')?.remove();
    });
    this.renderVisiblePages();
  }

  setZoom(scale) {
    const nextScale = Math.min(4, Math.max(0.5, scale));
    if (!this.pdfDoc || nextScale === this.scale) return Promise.resolve();
    this.scale = nextScale;
    const ratio = this.scale / (this.renderedScale || this.scale);
    this.pages.forEach(record => {
      if (record.container) {
        record.container.style.transformOrigin = 'top center';
        record.container.style.transform = `scale(${ratio})`;
      }
    });
    clearTimeout(this.zoomTimer);
    this.zoomTimer = setTimeout(() => {
      this.renderedScale = this.scale;
      this.renderGeneration++;
      this.cancelRenders();
      this.pages.forEach(record => {
        record.renderedScale = 0;
        record.container.style.transform = '';
      });
      this.renderVisiblePages();
    }, 150);
    return Promise.resolve();
  }

  zoomBy(delta) {
    return this.setZoom(this.scale + delta);
  }

  getAnnotations() {
    return this.annotations.map(annotation => ({ ...annotation }));
  }

  setAnnotations(annotations) {
    this.annotations = Array.isArray(annotations) ? annotations : [];
    this.renderAnnotations();
  }

  getStrokes() {
    return this.engines.flatMap((engine, index) => engine ? engine.strokes.map(stroke => ({ ...stroke, page: index + 1 })) : []);
  }

  setMode(mode) {
    this.engines.forEach(engine => engine?.setMode(mode));
  }

  setEraser(active) {
    this.engines.forEach(engine => engine?.setEraser(active));
  }

  undo() {
    for (let i = this.engines.length - 1; i >= 0; i--) {
      if (this.engines[i]?.strokes.length > 0) {
        this.engines[i].undo();
        break;
      }
    }
  }

  redo() {
    for (const engine of this.engines) {
      if (engine?.undoneStrokes.length > 0) {
        engine.redo();
        break;
      }
    }
  }

  clear() {
    this.engines.forEach(engine => engine?.clear());
  }
}

window.PDFViewer = PDFViewer;
