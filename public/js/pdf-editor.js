pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';




const state = {
    pdfDoc:       null,
    currentPage:  1,
    scale:        1.5,
    filename:     null,
    pagesData:    [],
    changes:      {},     
    scaleX:       1,
    scaleY:       1,
    selectedBox:  null,   
    activeAction: null,   
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
        const page = await state.pdfDoc.getPage(i);
        const vp   = page.getViewport({ scale: 0.3 });
        const cnv  = document.createElement('canvas');
        cnv.width  = vp.width;
        cnv.height = vp.height;
        await page.render({ canvasContext: cnv.getContext('2d'), viewport: vp }).promise;

        const wrap = document.createElement('div');
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
    deselectAll();
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
    state.scaleX = scaleX;
    state.scaleY = scaleY;

    pageData.blocks.forEach(block => {
        const box = createTextBox(block, scaleX, scaleY);
        overlay.appendChild(box);
    });
}

function createTextBox(block, scaleX, scaleY) {
    const saved = state.changes[block.id];

    
    const box = document.createElement('div');
    box.className = 'text-box' + (saved ? ' modified' : '');
    box.dataset.blockId = block.id;

    
    const origW = Math.max((block.x1 - block.x0) * scaleX, 20);
    const origH = Math.max((block.y1 - block.y0) * scaleY + 2, 14);

    
    const posX = saved?.new_x0 != null ? saved.new_x0 * scaleX : block.x0 * scaleX;
    const posY = saved?.new_y0 != null ? saved.new_y0 * scaleY : block.y0 * scaleY;
    const boxW = saved?.custom_width  ? saved.custom_width  * scaleX : origW;
    const boxH = saved?.custom_height ? saved.custom_height * scaleY : origH;

    box.style.left   = posX + 'px';
    box.style.top    = posY + 'px';
    box.style.width  = boxW + 'px';
    box.style.height = boxH + 'px';

    
    const content = document.createElement('div');
    content.className = 'text-box-content';
    content.textContent = saved ? saved.new_text : block.text;
    content.style.fontSize = (block.font_size * scaleY) + 'px';
    box.appendChild(content);

    
    ['nw', 'ne', 'sw', 'se', 'n', 's', 'w', 'e'].forEach(pos => {
        const handle = document.createElement('div');
        handle.className = `resize-handle rh-${pos}`;
        handle.dataset.pos = pos;
        box.appendChild(handle);
    });

    
    box._block = block;

    
    box.addEventListener('mousedown', (e) => {
        
        if (e.target.classList.contains('resize-handle')) return;

        
        if (box.classList.contains('editing')) return;

        e.preventDefault();
        e.stopPropagation();
        selectBox(box);
        startDrag(e, box);
    });

    
    box.addEventListener('dblclick', (e) => {
        e.preventDefault();
        e.stopPropagation();
        enterEditMode(box);
    });

    return box;
}




function selectBox(box) {
    if (state.selectedBox && state.selectedBox !== box) {
        deselectAll();
    }
    box.classList.add('selected');
    state.selectedBox = box;
}

function deselectAll() {
    if (state.selectedBox) {
        exitEditMode(state.selectedBox);
        state.selectedBox.classList.remove('selected');
        state.selectedBox = null;
    }
}


document.addEventListener('mousedown', (e) => {
    if (state.activeAction) return; 

    
    if (!e.target.closest('.text-box')) {
        deselectAll();
    }
});




function enterEditMode(box) {
    if (box.classList.contains('editing')) return;

    selectBox(box);
    box.classList.add('editing');

    const content = box.querySelector('.text-box-content');
    content.contentEditable = 'true';
    content.focus();

    
    const range = document.createRange();
    const sel   = window.getSelection();
    range.selectNodeContents(content);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);

    
    content._inputHandler = () => {
        const block    = box._block;
        const origText = block.text;
        const newText  = content.innerText;
        const scaleX   = state.scaleX;
        const scaleY   = state.scaleY;

        if (newText !== origText) {
            box.classList.add('modified');
            state.changes[block.id] = {
                ...block,
                new_text:      newText,
                new_x0:        parseFloat(box.style.left) / scaleX,
                new_y0:        parseFloat(box.style.top)  / scaleY,
                custom_width:  box.offsetWidth  / scaleX,
                custom_height: box.offsetHeight / scaleY,
            };
        } else {
            
            const origLeft = block.x0 * scaleX;
            const origTop  = block.y0 * scaleY;
            const movedOrResized = (
                Math.abs(parseFloat(box.style.left) - origLeft) > 1 ||
                Math.abs(parseFloat(box.style.top)  - origTop)  > 1
            );
            if (!movedOrResized) {
                box.classList.remove('modified');
                delete state.changes[block.id];
            }
        }
        btnSave.disabled = Object.keys(state.changes).length === 0;
    };

    content.addEventListener('input', content._inputHandler);
}

function exitEditMode(box) {
    if (!box || !box.classList.contains('editing')) return;

    box.classList.remove('editing');

    const content = box.querySelector('.text-box-content');
    content.contentEditable = 'false';

    
    if (content._inputHandler) {
        content.removeEventListener('input', content._inputHandler);
        content._inputHandler = null;
    }

    
    const block  = box._block;
    const newText = content.innerText;
    const scaleX  = state.scaleX;
    const scaleY  = state.scaleY;

    if (newText !== block.text || state.changes[block.id]) {
        box.classList.add('modified');
        state.changes[block.id] = {
            ...block,
            new_text:      newText,
            new_x0:        parseFloat(box.style.left) / scaleX,
            new_y0:        parseFloat(box.style.top)  / scaleY,
            custom_width:  box.offsetWidth  / scaleX,
            custom_height: box.offsetHeight / scaleY,
        };
        btnSave.disabled = false;
    }
}




let dragState = {};

function startDrag(e, box) {
    state.activeAction = 'drag';

    const overlayRect = overlay.getBoundingClientRect();

    dragState = {
        box,
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        startLeft:   parseFloat(box.style.left),
        startTop:    parseFloat(box.style.top),
        overlayRect,
    };

    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', endDrag);
}

function onDrag(e) {
    const { box, startMouseX, startMouseY, startLeft, startTop } = dragState;

    const dx = e.clientX - startMouseX;
    const dy = e.clientY - startMouseY;

    
    const newLeft = Math.max(0, startLeft + dx);
    const newTop  = Math.max(0, startTop  + dy);

    box.style.left = newLeft + 'px';
    box.style.top  = newTop  + 'px';
}

function endDrag(e) {
    document.removeEventListener('mousemove', onDrag);
    document.removeEventListener('mouseup', endDrag);

    const box    = dragState.box;
    const block  = box._block;
    const scaleX = state.scaleX;
    const scaleY = state.scaleY;

    
    const origLeft = block.x0 * scaleX;
    const origTop  = block.y0 * scaleY;
    const curLeft  = parseFloat(box.style.left);
    const curTop   = parseFloat(box.style.top);
    const hasMoved = Math.abs(curLeft - origLeft) > 2 || Math.abs(curTop - origTop) > 2;

    const existing = state.changes[block.id];
    const curText  = box.querySelector('.text-box-content').innerText;

    if (hasMoved || curText !== block.text || existing) {
        box.classList.add('modified');
        state.changes[block.id] = {
            ...block,
            new_text:      curText,
            new_x0:        curLeft / scaleX,
            new_y0:        curTop  / scaleY,
            custom_width:  box.offsetWidth  / scaleX,
            custom_height: box.offsetHeight / scaleY,
        };
        btnSave.disabled = false;
    }

    state.activeAction = null;
    dragState = {};
}




let resizeState = {};


document.addEventListener('mousedown', (e) => {
    if (!e.target.classList.contains('resize-handle')) return;

    e.preventDefault();
    e.stopPropagation();

    const handle = e.target;
    const box    = handle.closest('.text-box');
    if (!box) return;

    selectBox(box);
    state.activeAction = 'resize';

    resizeState = {
        box,
        pos:         handle.dataset.pos,
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        startLeft:   parseFloat(box.style.left),
        startTop:    parseFloat(box.style.top),
        startWidth:  box.offsetWidth,
        startHeight: box.offsetHeight,
    };

    document.addEventListener('mousemove', onResize);
    document.addEventListener('mouseup', endResize);
});

function onResize(e) {
    const { box, pos, startMouseX, startMouseY, startLeft, startTop, startWidth, startHeight } = resizeState;

    const dx = e.clientX - startMouseX;
    const dy = e.clientY - startMouseY;

    const MIN_W = 15;
    const MIN_H = 10;

    let newLeft   = startLeft;
    let newTop    = startTop;
    let newWidth  = startWidth;
    let newHeight = startHeight;

    
    if (pos.includes('e')) {
        newWidth = Math.max(MIN_W, startWidth + dx);
    }
    if (pos.includes('w')) {
        newWidth = Math.max(MIN_W, startWidth - dx);
        newLeft  = startLeft + (startWidth - newWidth);
    }

    
    if (pos.includes('s')) {
        newHeight = Math.max(MIN_H, startHeight + dy);
    }
    if (pos.includes('n')) {
        newHeight = Math.max(MIN_H, startHeight - dy);
        newTop    = startTop + (startHeight - newHeight);
    }

    box.style.left   = newLeft   + 'px';
    box.style.top    = newTop    + 'px';
    box.style.width  = newWidth  + 'px';
    box.style.height = newHeight + 'px';
}

function endResize(e) {
    document.removeEventListener('mousemove', onResize);
    document.removeEventListener('mouseup', endResize);

    const box    = resizeState.box;
    const block  = box._block;
    const scaleX = state.scaleX;
    const scaleY = state.scaleY;

    const curText = box.querySelector('.text-box-content').innerText;

    box.classList.add('modified');
    state.changes[block.id] = {
        ...block,
        new_text:      curText,
        new_x0:        parseFloat(box.style.left) / scaleX,
        new_y0:        parseFloat(box.style.top)  / scaleY,
        custom_width:  box.offsetWidth  / scaleX,
        custom_height: box.offsetHeight / scaleY,
    };
    btnSave.disabled = false;

    state.activeAction = null;
    resizeState = {};
}




document.addEventListener('keydown', (e) => {
    
    if (e.key === 'Escape') {
        deselectAll();
    }

    
    if (e.key === 'Enter' && state.selectedBox && !state.selectedBox.classList.contains('editing')) {
        e.preventDefault();
        enterEditMode(state.selectedBox);
    }
});




btnSave.addEventListener('click', async () => {
    deselectAll(); 

    const changesList = Object.values(state.changes);
    if (!changesList.length) return toast('No changes to save', 'error');

    showLoading('Applying changes & generating PDF...');

    try {
        const res = await fetch('/pdf-editor/save', {
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

        toast('PDF saved! Downloading...', 'success');

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
    state.pdfDoc      = null;
    state.filename    = null;
    state.pagesData   = [];
    state.changes     = {};
    state.selectedBox = null;
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
