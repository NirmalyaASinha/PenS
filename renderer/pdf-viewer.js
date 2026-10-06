class PDFViewer {
  constructor(container, filePath, fileUrl) {
    this.container = container;
    this.filePath = filePath || fileUrl;
    this.fileUrl = fileUrl || filePath;
    this.scale = 1.5;
    this.pdfDoc = null;
    this.engines = [];
    this.annotations = [];
    this.textToolEnabled = false;
    
    this.container.style.overflowY = 'auto';
    this.container.style.backgroundColor = '#525659';
    this.container.style.display = 'flex';
    this.container.style.flexDirection = 'column';
    this.container.style.alignItems = 'center';
    this.container.style.padding = '20px 0';
    this.container.style.height = '100%';

    this.ready = this.loadPDF();
  }

  async loadPDF() {
    try {
      this.container.innerHTML = `<div style="color:#e8eaed; padding: 40px; font-family: 'Segoe UI', sans-serif; display: flex; align-items: center; justify-content: center; gap: 10px;">
        <span>Loading PDF...</span>
      </div>`;

      let docInitParams = null;
      if (window.electronAPI && window.electronAPI.readPdf) {
        const result = await window.electronAPI.readPdf(this.filePath);
        if (result && result.error) {
          throw new Error(result.error);
        }
        if (result && !(result instanceof Error)) {
          let uint8;
          if (result instanceof Uint8Array) {
            uint8 = result;
          } else if (result instanceof ArrayBuffer) {
            uint8 = new Uint8Array(result);
          } else if (result.type === 'Buffer' && Array.isArray(result.data)) {
            uint8 = Uint8Array.from(result.data);
          } else if (result.data instanceof ArrayBuffer) {
            uint8 = new Uint8Array(result.data);
          }
          if (!uint8) throw new Error('The selected PDF could not be read.');
          docInitParams = {
            data: uint8,
            isEvalSupported: false,
            enableScripting: false
          };
        }
      }

      if (!docInitParams) {
        docInitParams = {
          url: this.fileUrl,
          isEvalSupported: false,
          enableScripting: false
        };
      }

      let attempts = 0;
      while (!window.pdfjsLib && attempts < 50) {
        await new Promise(r => setTimeout(r, 100));
        attempts++;
      }
      if (!window.pdfjsLib) {
        throw new Error('PDF.js library is not ready or failed to load');
      }

      const loadingTask = window.pdfjsLib.getDocument(docInitParams);
      this.pdfDoc = await loadingTask.promise;
      
      this.container.innerHTML = '';
      this.engines = [];
      for (let pageNum = 1; pageNum <= this.pdfDoc.numPages; pageNum++) {
        await this.renderPage(pageNum);
      }
      this.renderAnnotations();
    } catch (e) {
      console.error('Error loading PDF:', e);
      this.container.innerHTML = `<div style="color:white; padding: 40px; font-family: 'Segoe UI', sans-serif; text-align: center;">
        <h3 style="margin: 0 0 10px 0; color: #f28b82; font-size: 18px;">Error loading PDF</h3>
        <p style="color: #dadce0; font-size: 14px; max-width: 600px; margin: 0 auto;">${e.message}</p>
      </div>`;
    }
  }

  async renderPage(pageNum) {
    const page = await this.pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: this.scale });

    const pageContainer = document.createElement('div');
    pageContainer.style.position = 'relative';
    pageContainer.style.marginBottom = '20px';
    pageContainer.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
    pageContainer.style.width = `${viewport.width}px`;
    pageContainer.style.height = `${viewport.height}px`;
    pageContainer.style.backgroundColor = 'white';

    // Render PDF to canvas
    const pdfCanvas = document.createElement('canvas');
    const outputScale = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
    pdfCanvas.width = Math.floor(viewport.width * outputScale);
    pdfCanvas.height = Math.floor(viewport.height * outputScale);
    pdfCanvas.style.width = `${viewport.width}px`;
    pdfCanvas.style.height = `${viewport.height}px`;
    pdfCanvas.style.display = 'block';
    
    const context = pdfCanvas.getContext('2d');
    const renderContext = {
      canvasContext: context,
      viewport,
      transform: outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0]
    };
    
    await page.render(renderContext).promise;
    
    pageContainer.dataset.pageNumber = String(pageNum);
    pageContainer.appendChild(pdfCanvas);
    this.container.appendChild(pageContainer);

    // Initialize InkEngine for this page container
    const sourceId = `${this.fileUrl}_page_${pageNum}`;
    const engine = new window.InkEngine(pageContainer, sourceId);
    if (window.effectiveMode) engine.setMode(window.effectiveMode);
    if (window.isEraser) engine.setEraser(window.isEraser);
    this.engines.push(engine);

    pageContainer.addEventListener('click', (event) => {
      if (!this.textToolEnabled || event.target.closest('.pdf-text-annotation')) return;
      const rect = pageContainer.getBoundingClientRect();
      const text = window.prompt('Enter a comment or text for this PDF page:');
      if (!text || !text.trim()) return;
      this.annotations.push({
        page: pageNum,
        x: Math.max(0, (event.clientX - rect.left) / rect.width),
        y: Math.max(0, (event.clientY - rect.top) / rect.height),
        text: text.trim()
      });
      this.renderAnnotations();
    });
  }

  setTextTool(enabled) {
    this.textToolEnabled = enabled;
    this.container.classList.toggle('pdf-text-mode', enabled);
  }

  renderAnnotations() {
    this.container.querySelectorAll('.pdf-text-annotation').forEach((node) => node.remove());
    for (const annotation of this.annotations) {
      const page = this.container.querySelector(`[data-page-number="${annotation.page}"]`);
      if (!page) continue;
      const node = document.createElement('div');
      node.className = 'pdf-text-annotation';
      node.textContent = annotation.text;
      node.style.left = `${annotation.x * 100}%`;
      node.style.top = `${annotation.y * 100}%`;
      page.appendChild(node);
    }
  }

  async setZoom(scale) {
    this.scale = Math.min(4, Math.max(0.5, scale));
    await this.loadPDF();
  }

  zoomBy(delta) {
    return this.setZoom(this.scale + delta);
  }

  getAnnotations() {
    return this.annotations.map((annotation) => ({ ...annotation }));
  }

  setAnnotations(annotations) {
    this.annotations = Array.isArray(annotations) ? annotations : [];
    this.renderAnnotations();
  }

  getStrokes() {
    return this.engines.flatMap((engine, index) => engine.strokes.map((stroke) => ({
      ...stroke,
      page: index + 1
    })));
  }

  setMode(mode) {
    this.engines.forEach(eng => eng.setMode(mode));
  }
  
  setEraser(active) {
    this.engines.forEach(eng => eng.setEraser(active));
  }

  undo() {
    for (let i = this.engines.length - 1; i >= 0; i--) {
      if (this.engines[i].strokes.length > 0) {
        this.engines[i].undo();
        break;
      }
    }
  }

  redo() {
    for (let i = 0; i < this.engines.length; i++) {
      if (this.engines[i].undoneStrokes.length > 0) {
        this.engines[i].redo();
        break;
      }
    }
  }

  clear() {
    this.engines.forEach(eng => eng.clear());
  }
}

window.PDFViewer = PDFViewer;
