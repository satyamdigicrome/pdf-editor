pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// STATE
const state = {
    pdfDoc:       null,
    currentPage:  1,
    scale:        1.5,
    filename:     null,
    pagesData:    [],
    changes:      {},
    scaleX:       1,
    scaleY:       1,
    editingBox:   null,
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

// UTILITIES
function showLoading(text = 'Processing...') {
    loadingText.textContent = text;
    loading.classList.add('show');
}
function hideLoading() { loading.classList.remove('show'); }

function toast(msg, type = 'success') {
    const el = $('toast');
    el.textContent = msg;
    el.className   = 'show ' + type;
    setTimeout(() => el.className = '', 3000);
}

function csrf() {
    return document.querySelector('meta[name="csrf-token"]').content;
}

// FILE HANDLING
fileInput.addEventListener('change', e => handleFile(e.target.files[0]));

dropZone.addEventListener('dragover', e => {
    e.preventDefault();
    dropZone.style.borderColor = '#e94560';
});
dropZone.addEventListener('dragleave', () => {
    dropZone.style.borderColor = '';
});
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

// EDITOR INIT
function initEditor() {
    dropZone.style.display     = 'none';
    editorLayout.style.display = 'block';
    btnSave.style.display      = 'inline-block';
    btnReset.style.display     = 'inline-block';
    buildThumbs();
    renderPage(1);
}

// THUMBNAILS
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
        wrap.className  = 'page-thumb' + (i === 1 ? ' active' : '');
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

// PAGE RENDER
async function renderPage(pageNum) {
    state.currentPage = pageNum;
    if (state.editingBox) {
        exitAndSave(state.editingBox);
        state.editingBox = null;
    }
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

// OVERLAY BUILDER
function buildOverlay(pageNum, vp) {
    overlay.innerHTML = '';
    overlay.style.position      = 'absolute';
    overlay.style.top           = '0';
    overlay.style.left          = '0';
    overlay.style.width         = vp.width  + 'px';
    overlay.style.height        = vp.height + 'px';
    overlay.style.overflow      = 'hidden';
    overlay.style.pointerEvents = 'auto';
    const pageData = state.pagesData.find(p => p.page === pageNum - 1);
    if (!pageData) return;
    const scaleX = vp.width  / pageData.width;
    const scaleY = vp.height / pageData.height;
    state.scaleX = scaleX;
    state.scaleY = scaleY;
    pageData.blocks.forEach(block => {
        overlay.appendChild(createTextBox(block, scaleX, scaleY));
    });
}

// CREATE TEXT BOX — no individual event handlers
function createTextBox(block, scaleX, scaleY) {
    const saved = state.changes[block.id];
    const box = document.createElement('div');
    box.className = 'text-box' + (saved ? ' modified' : '');
    box.dataset.blockId = block.id;
    box._block = block;

    const origW = Math.max((block.x1 - block.x0) * scaleX, 10);
    const origH = Math.max((block.y1 - block.y0) * scaleY, block.font_size * scaleY * 1.1);
    const posX = (saved?.new_x0 != null) ? saved.new_x0 * scaleX : block.x0 * scaleX;
    const posY = (saved?.new_y0 != null) ? saved.new_y0 * scaleY : block.y0 * scaleY;
    const boxW = saved?.custom_width  ? saved.custom_width  * scaleX : origW;
    const boxH = saved?.custom_height ? saved.custom_height * scaleY : origH;

    box.style.left          = posX + 'px';
    box.style.top           = posY + 'px';
    box.style.width         = boxW + 'px';
    box.style.height        = boxH + 'px';
    box.style.pointerEvents = 'none'; // overlay handles all clicks via bbox math

    const content = document.createElement('div');
    content.className   = 'text-box-content';
    content.textContent = saved ? saved.new_text : block.text;
    content.style.fontSize = (block.font_size * scaleY) + 'px';
    box.appendChild(content);

    ['nw', 'ne', 'sw', 'se', 'n', 's', 'w', 'e'].forEach(pos => {
        const h = document.createElement('div');
        h.className = `resize-handle rh-${pos}`;
        h.dataset.pos = pos;
        h.style.pointerEvents = 'auto';
        box.appendChild(h);
    });

    return box;
}

// ============================================================
// CORE: OVERLAY-LEVEL CLICK HANDLER
// KEY FIX: picks SMALLEST bbox containing the click point.
// Overlapping boxes never hijack each other.
// Single click = edit mode (PDFfiller / Sejda style).
// ============================================================
overlay.addEventListener('mousedown', function (e) {
    if (state.activeAction) return;

    // Resize handle?
    if (e.target.classList.contains('resize-handle')) {
        e.preventDefault();
        e.stopPropagation();
        const box = e.target.closest('.text-box');
        if (box) startResize(e, box, e.target.dataset.pos);
        return;
    }

    // Click inside the already-editing box?
    // Let native contentEditable handle cursor placement.
    if (state.editingBox && state.editingBox.contains(e.target)) {
        return;
    }

    const oRect  = overlay.getBoundingClientRect();
    const clickX = e.clientX - oRect.left;
    const clickY = e.clientY - oRect.top;

    // All boxes whose bbox contains the click point
    const hits = [...overlay.querySelectorAll('.text-box')].filter(box => {
        const l = parseFloat(box.style.left);
        const t = parseFloat(box.style.top);
        return clickX >= l && clickX <= l + box.offsetWidth &&
               clickY >= t && clickY <= t + box.offsetHeight;
    });

    // Empty canvas click
    if (!hits.length) {
        e.stopPropagation();
        if (state.editingBox) {
            exitAndSave(state.editingBox);
            state.editingBox = null;
        }
        return;
    }

    // Pick SMALLEST area = most specific match
    const target = hits.reduce((best, box) =>
        (box.offsetWidth * box.offsetHeight < best.offsetWidth * best.offsetHeight) ? box : best
    );

    e.preventDefault();
    e.stopPropagation();

    if (state.editingBox && state.editingBox !== target) {
        exitAndSave(state.editingBox);
        state.editingBox = null;
    }

    // Single click = enter edit mode
    if (!target.classList.contains('editing')) {
        enterEditMode(target);
    }

    setupPotentialDrag(e, target);
});

document.addEventListener('mousedown', function (e) {
    if (state.activeAction) return;
    if (!e.target.closest('#overlay-container') && !e.target.closest('#pdf-wrapper')) {
        if (state.editingBox) {
            exitAndSave(state.editingBox);
            state.editingBox = null;
        }
    }
});

// EDIT MODE
function enterEditMode(box) {
    if (box.classList.contains('editing')) return;
    box.classList.add('editing');
    box.style.pointerEvents = 'auto';
    box.style.zIndex = '50';
    state.editingBox = box;
    box._origW = box.offsetWidth;
    const content = box.querySelector('.text-box-content');
    content.contentEditable     = 'true';
    content.style.pointerEvents = 'auto';
    content.focus();
    const range = document.createRange();
    const sel   = window.getSelection();
    range.selectNodeContents(content);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
    content._inputHandler = () => autoExpandAndTrack(box);
    content.addEventListener('input', content._inputHandler);
}

function exitEditMode(box) {
    if (!box || !box.classList.contains('editing')) return;
    box.classList.remove('editing');
    box.style.pointerEvents = 'none';
    box.style.zIndex = '';
    const content = box.querySelector('.text-box-content');
    content.contentEditable     = 'false';
    content.style.pointerEvents = '';
    content.style.width         = '';
    content.style.display       = '';
    if (content._inputHandler) {
        content.removeEventListener('input', content._inputHandler);
        content._inputHandler = null;
    }
}

function exitAndSave(box) {
    if (!box) return;
    const content = box.querySelector('.text-box-content');
    const block   = box._block;
    const newText = content.innerText.trim();
    exitEditMode(box);
    const origLeft = block.x0 * state.scaleX;
    const origTop  = block.y0 * state.scaleY;
    const curLeft  = parseFloat(box.style.left);
    const curTop   = parseFloat(box.style.top);
    const hasMoved = Math.abs(curLeft - origLeft) > 1 || Math.abs(curTop - origTop) > 1;
    if (newText !== block.text || hasMoved) {
        box.classList.add('modified');
        state.changes[block.id] = {
            ...block,
            new_text:      newText,
            new_x0:        curLeft / state.scaleX,
            new_y0:        curTop  / state.scaleY,
            custom_width:  box.offsetWidth  / state.scaleX,
            custom_height: box.offsetHeight / state.scaleY,
        };
    } else {
        box.classList.remove('modified');
        delete state.changes[block.id];
    }
    btnSave.disabled = Object.keys(state.changes).length === 0;
}

function autoExpandAndTrack(box) {
    const content = box.querySelector('.text-box-content');
    const block   = box._block;
    content.style.width   = 'auto';
    content.style.display = 'inline-block';
    const naturalW = content.scrollWidth + 8;
    content.style.width   = '';
    content.style.display = '';
    box.style.width = Math.max(box._origW || 0, naturalW) + 'px';
    const naturalH = content.scrollHeight + 2;
    if (naturalH > box.offsetHeight) {
        box.style.height = naturalH + 'px';
    }
    const newText = content.innerText;
    if (newText !== block.text || state.changes[block.id]) {
        box.classList.add('modified');
        state.changes[block.id] = {
            ...block,
            new_text:      newText,
            new_x0:        parseFloat(box.style.left) / state.scaleX,
            new_y0:        parseFloat(box.style.top)  / state.scaleY,
            custom_width:  box.offsetWidth  / state.scaleX,
            custom_height: box.offsetHeight / state.scaleY,
        };
    } else {
        box.classList.remove('modified');
        delete state.changes[block.id];
    }
    btnSave.disabled = Object.keys(state.changes).length === 0;
}

// DRAG — activates only if mouse moves > 5 px
let _drag = null;

function setupPotentialDrag(e, box) {
    _drag = {
        box,
        startX:    e.clientX,
        startY:    e.clientY,
        startLeft: parseFloat(box.style.left),
        startTop:  parseFloat(box.style.top),
        active:    false,
    };
    document.addEventListener('mousemove', _onDragMove);
    document.addEventListener('mouseup',   _onDragUp);
}

function _onDragMove(e) {
    if (!_drag) return;
    const dx = e.clientX - _drag.startX;
    const dy = e.clientY - _drag.startY;
    if (!_drag.active && Math.hypot(dx, dy) > 5) {
        _drag.active = true;
        state.activeAction = 'drag';
        const box = _drag.box;
        box.classList.add('dragging');
        const content = box.querySelector('.text-box-content');
        content.contentEditable = 'false';
    }
    if (_drag.active) {
        e.preventDefault();
        _drag.box.style.left = Math.max(0, _drag.startLeft + dx) + 'px';
        _drag.box.style.top  = Math.max(0, _drag.startTop  + dy) + 'px';
    }
}

function _onDragUp() {
    document.removeEventListener('mousemove', _onDragMove);
    document.removeEventListener('mouseup',   _onDragUp);
    if (!_drag) return;
    const { box, active } = _drag;
    _drag = null;
    if (active) {
        state.activeAction = null;
        box.classList.remove('dragging');
        const content = box.querySelector('.text-box-content');
        content.contentEditable = 'true';
        content.focus();
        autoExpandAndTrack(box);
    }
}

// RESIZE
let _resize = {};

function startResize(e, box, pos) {
    state.activeAction = 'resize';
    _resize = {
        box, pos,
        startX: e.clientX, startY: e.clientY,
        startL: parseFloat(box.style.left),
        startT: parseFloat(box.style.top),
        startW: box.offsetWidth,
        startH: box.offsetHeight,
    };
    document.addEventListener('mousemove', _onResizeMove);
    document.addEventListener('mouseup',   _onResizeUp);
}

function _onResizeMove(e) {
    const { box, pos, startX, startY, startL, startT, startW, startH } = _resize;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const MIN_W = 20, MIN_H = 10;
    let nl = startL, nt = startT, nw = startW, nh = startH;
    if (pos.includes('e')) nw = Math.max(MIN_W, startW + dx);
    if (pos.includes('w')) { nw = Math.max(MIN_W, startW - dx); nl = startL + (startW - nw); }
    if (pos.includes('s')) nh = Math.max(MIN_H, startH + dy);
    if (pos.includes('n')) { nh = Math.max(MIN_H, startH - dy); nt = startT + (startH - nh); }
    box.style.left   = nl + 'px';
    box.style.top    = nt + 'px';
    box.style.width  = nw + 'px';
    box.style.height = nh + 'px';
}

function _onResizeUp() {
    document.removeEventListener('mousemove', _onResizeMove);
    document.removeEventListener('mouseup',   _onResizeUp);
    const { box } = _resize;
    _resize = {};
    state.activeAction = null;
    box._origW = box.offsetWidth;
    autoExpandAndTrack(box);
}

// KEYBOARD
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        if (state.editingBox) {
            exitAndSave(state.editingBox);
            state.editingBox = null;
        }
    }
    if (e.key === 'Tab' && state.editingBox) {
        e.preventDefault();
        const boxes   = [...overlay.querySelectorAll('.text-box')];
        const curIdx  = boxes.indexOf(state.editingBox);
        const nextIdx = e.shiftKey
            ? (curIdx - 1 + boxes.length) % boxes.length
            : (curIdx + 1) % boxes.length;
        exitAndSave(state.editingBox);
        state.editingBox = null;
        enterEditMode(boxes[nextIdx]);
    }
});

// SAVE & DOWNLOAD
btnSave.addEventListener('click', async () => {
    if (state.editingBox) {
        exitAndSave(state.editingBox);
        state.editingBox = null;
    }
    const changesList = Object.values(state.changes);
    if (!changesList.length) return toast('No changes to save', 'error');
    showLoading('Applying changes & generating PDF...');
    try {
        const res = await fetch('/pdf-editor/save', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrf() },
            body: JSON.stringify({ filename: state.filename, changes: changesList }),
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

// RESET
btnReset.addEventListener('click', () => {
    state.pdfDoc       = null;
    state.filename     = null;
    state.pagesData    = [];
    state.changes      = {};
    state.editingBox   = null;
    state.activeAction = null;
    fileNameEl.textContent = '';
    btnSave.disabled       = true;
    btnSave.style.display  = 'none';
    btnReset.style.display = 'none';
    editorLayout.style.display = 'none';
    dropZone.style.display     = 'flex';
    fileInput.value    = '';
    thumbsEl.innerHTML = '';
    overlay.innerHTML  = '';
});
