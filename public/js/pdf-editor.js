pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const state = {
    pdfDoc:       null,
    currentPage:  1,
    scale:        1.5,
    filename:     null,
    pagesData:    [],
    changes:      {},
};
const $ = id => document.getElementById(id);
const dropZone     = $('drop-zone');
const editorLayout = $('editor-layout');
const canvas       = $('pdf-canvas');
const ctx          = canvas.getContext('2d');
const overlay      = $('overlay-container');
const thumbsEl     = $('page-thumbs');
const loading      = $('loading');
const loadingText  = $('loading-text');
const btnSave      = $('btn-save');
const btnReset     = $('btn-reset');
const fileInput    = $('file-input');
const fileNameEl   = $('file-name');
function showLoading(text = 'Processing...') {
    loadingText.textContent = text;
    loading.classList.add('show');
}
function hideLoading() { loading.classList.remove('show'); }
function toast(msg, type = 'success') {
    const el = $('toast');
    el.textContent = msg;
    el.className = 'show ' + type;
    setTimeout(() => el.className = '', 3000);
}
function csrf() {
    return document.querySelector('meta[name="csrf-token"]').content;
}
fileInput.addEventListener('change', e => handleFile(e.target.files[0]));
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.style.borderColor = '#e94560'; });
dropZone.addEventListener('dragleave', () => { dropZone.style.borderColor = ''; });
dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.style.borderColor = '';
    const file = e.dataTransfer.files[0];
    if (file?.type === 'application/pdf') handleFile(file);
    else toast('Please drop a PDF file', 'error');
});
async function handleFile(file) {
    if (!file) return;
    showLoading('Uploading & parsing PDF...');
    const fd = new FormData();
    fd.append('pdf', file);
    fd.append('_token', csrf());
    try {
        const res  = await fetch('/pdf-editor/upload', { method: 'POST', body: fd });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Upload failed');
        state.filename  = data.filename;
        state.pagesData = data.pages;
        state.changes   = {};
        fileNameEl.textContent = file.name;
        const arrayBuf = await file.arrayBuffer();
        state.pdfDoc   = await pdfjsLib.getDocument({ data: arrayBuf }).promise;
        initEditor();
    } catch (err) {
        toast(err.message, 'error');
        console.error(err);
    } finally {
        hideLoading();
    }
}
function initEditor() {
    dropZone.style.display     = 'none';
    editorLayout.style.display = 'block';
    btnSave.style.display      = 'inline-block';
    btnReset.style.display     = 'inline-block';
    buildThumbs();
    renderPage(1);
}
async function buildThumbs() {
    thumbsEl.innerHTML = '';
    const total = state.pdfDoc.numPages;
    for (let i = 1; i <= total; i++) {
        const page    = await state.pdfDoc.getPage(i);
        const vp      = page.getViewport({ scale: 0.3 });
        const cnv     = document.createElement('canvas');
        cnv.width     = vp.width;
        cnv.height    = vp.height;
        await page.render({ canvasContext: cnv.getContext('2d'), viewport: vp }).promise;
        const wrap  = document.createElement('div');
        wrap.className = 'page-thumb' + (i === 1 ? ' active' : '');
        wrap.dataset.page = i;
        wrap.appendChild(cnv);
        const label = document.createElement('span');
        label.textContent = `Page ${i}`;
        wrap.appendChild(label);
        wrap.addEventListener('click', () => {
            document.querySelectorAll('.page-thumb').forEach(t => t.classList.remove('active'));
            wrap.classList.add('active');
            renderPage(i);
        });
        thumbsEl.appendChild(wrap);
    }
}
async function renderPage(pageNum) {
    state.currentPage = pageNum;
    showLoading('Rendering page...');
    try {
        const page = await state.pdfDoc.getPage(pageNum);
        const vp   = page.getViewport({ scale: state.scale });
        canvas.width  = vp.width;
        canvas.height = vp.height;
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        buildOverlay(pageNum, vp);
    } finally {
        hideLoading();
    }
}
function buildOverlay(pageNum, vp) {
    overlay.innerHTML = '';
    overlay.style.position = 'absolute';
    overlay.style.inset    = '0';
    const pageData = state.pagesData.find(p => p.page === pageNum - 1);
    if (!pageData) return;
    const scaleX = vp.width  / pageData.width;
    const scaleY = vp.height / pageData.height;
    pageData.blocks.forEach(block => {
        const inp = document.createElement('input');
        inp.type  = 'text';
        const saved = state.changes[block.id];
        inp.value   = saved ? saved.new_text : block.text;
        inp.style.cssText = `
            left:      ${block.x0 * scaleX}px;
            top:       ${block.y0 * scaleY}px;
            width:     ${Math.max((block.x1 - block.x0) * scaleX, 30)}px;
            height:    ${Math.max((block.y1 - block.y0) * scaleY + 2, 14)}px;
            font-size: ${block.font_size * scaleY}px;
        `;
        inp.className = 'text-overlay' + (saved ? ' modified' : '');
        inp.dataset.blockId = block.id;
        inp.addEventListener('input', () => {
            const isChanged = inp.value !== block.text;
            if (isChanged) {
                inp.classList.add('modified');
                state.changes[block.id] = { ...block, new_text: inp.value };
            } else {
                inp.classList.remove('modified');
                delete state.changes[block.id];
            }
            btnSave.disabled = Object.keys(state.changes).length === 0;
        });
        overlay.appendChild(inp);
    });
}
btnSave.addEventListener('click', async () => {
    const changesList = Object.values(state.changes);
    if (!changesList.length) return toast('No changes to save', 'error');

    showLoading('Applying changes & generating PDF...');

    try {
        const res  = await fetch('/pdf-editor/save', {
            method:  'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-TOKEN': csrf()
            },
            body: JSON.stringify({
                filename: state.filename,
                changes:  changesList
            })
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Save failed');
        toast('PDF saved successfully! Downloading...', 'success');
        const a    = document.createElement('a');
        a.href     = data.download_url;
        a.download = 'edited_' + state.filename;
        a.click();

    } catch (err) {
        toast(err.message, 'error');
        console.error(err);
    } finally {
        hideLoading();
    }
});
btnReset.addEventListener('click', () => {
    state.pdfDoc     = null;
    state.filename   = null;
    state.pagesData  = [];
    state.changes    = {};
    fileNameEl.textContent = '';
    btnSave.disabled       = true;
    btnSave.style.display  = 'none';
    btnReset.style.display = 'none';
    editorLayout.style.display = 'none';
    dropZone.style.display     = 'flex';
    fileInput.value = '';
    thumbsEl.innerHTML = '';
    overlay.innerHTML  = '';
});
