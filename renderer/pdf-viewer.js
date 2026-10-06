class PDFViewer {
  constructor(container, fileUrl) {
    this.container = container;
    this.fileUrl = fileUrl;
    this.scale = 1.5;
    this.pdfDoc = null;
    this.engines = [];
    
    this.container.style.overflowY = 'auto';
    this.container.style.backgroundColor = '#525659';
    this.container.style.display = 'flex';
    this.container.style.flexDirection = 'column';
    this.container.style.alignItems = 'center';
    this.container.style.padding = '20px 0';
    this.container.style.height = '100%';

    this.loadPDF();
  }

  async loadPDF() {
    try {
      const loadingTask = window.pdfjsLib.getDocument({
        url: this.fileUrl,
        isEvalSupported: false,
        enableScripting: false
      });
      this.pdfDoc = await loadingTask.promise;
      
      for (let pageNum = 1; pageNum <= this.pdfDoc.numPages; pageNum++) {
        await this.renderPage(pageNum);
      }
    } catch (e) {
      console.error('Error loading PDF:', e);
      this.container.innerHTML = `<div style="color:white; padding: 20px;">Error loading PDF: ${e.message}</div>`;
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
    pdfCanvas.width = viewport.width;
    pdfCanvas.height = viewport.height;
    pdfCanvas.style.display = 'block';
    
    const context = pdfCanvas.getContext('2d');
    const renderContext = {
      canvasContext: context,
      viewport: viewport
    };
    
    await page.render(renderContext).promise;
    
    pageContainer.appendChild(pdfCanvas);
    this.container.appendChild(pageContainer);

    // Initialize InkEngine for this page container
    const sourceId = `${this.fileUrl}_page_${pageNum}`;
    const engine = new window.InkEngine(pageContainer, sourceId);
    if (window.effectiveMode) engine.setMode(window.effectiveMode);
    if (window.isEraser) engine.setEraser(window.isEraser);
    this.engines.push(engine);
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
}

window.PDFViewer = PDFViewer;
