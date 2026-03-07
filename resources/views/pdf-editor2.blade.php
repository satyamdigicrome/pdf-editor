<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PDF Editor</title>
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <style>
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: 'Segoe UI', sans-serif;
            background: #1a1a2e;
            color: #eee;
            min-height: 100vh;
        }

        /* ── Top Bar ── */
        #topbar {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px 20px;
            background: #16213e;
            border-bottom: 1px solid #0f3460;
            position: sticky;
            top: 0;
            z-index: 100;
        }

        #topbar h1 {
            font-size: 18px;
            color: #e94560;
            flex: 1;
        }

        .btn {
            padding: 8px 18px;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 600;
            transition: opacity .2s;
        }

        .btn:disabled {
            opacity: .4;
            cursor: not-allowed;
        }

        .btn-primary {
            background: #e94560;
            color: #fff;
        }

        .btn-success {
            background: #0f9b58;
            color: #fff;
        }

        .btn-outline {
            background: transparent;
            border: 1px solid #555;
            color: #ccc;
        }

        .btn:hover:not(:disabled) {
            opacity: .85;
        }

        /* ── Drop Zone ── */
        #drop-zone {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 16px;
            height: calc(100vh - 56px);
        }

        #drop-zone .icon {
            font-size: 64px;
        }

        #drop-zone h2 {
            font-size: 22px;
            color: #aaa;
        }

        #drop-zone p {
            color: #666;
        }

        /* ── Editor Layout ── */
        #editor-layout {
            display: none;
            height: calc(100vh - 56px);
        }

        /* Sidebar */
        #sidebar {
            width: 240px;
            background: #16213e;
            border-right: 1px solid #0f3460;
            overflow-y: auto;
            padding: 12px;
            display: flex;
            flex-direction: column;
            gap: 8px;
            float: left;
            height: 100%;
        }

        #sidebar h3 {
            font-size: 13px;
            color: #888;
            text-transform: uppercase;
            margin-bottom: 4px;
        }

        .page-thumb {
            width: 100%;
            border: 2px solid transparent;
            border-radius: 4px;
            cursor: pointer;
            overflow: hidden;
            transition: border-color .2s;
        }

        .page-thumb.active {
            border-color: #e94560;
        }

        .page-thumb canvas {
            width: 100%;
            display: block;
        }

        .page-thumb span {
            display: block;
            text-align: center;
            font-size: 11px;
            color: #888;
            padding: 3px;
        }

        /* Canvas area */
        #canvas-area {
            overflow: auto;
            height: 100%;
            background: #222;
            display: flex;
            justify-content: center;
            padding: 24px;
            margin-left: 240px;
        }

        #pdf-wrapper {
            position: relative;
            display: inline-block;
            box-shadow: 0 4px 32px rgba(0, 0, 0, .5);
        }

        #pdf-canvas {
            display: block;
        }

        /* ══════════════════════════════════════════════════
           Canva-like text box system
           States: default → hover → editing → modified
           ══════════════════════════════════════════════════ */

        .text-box {
            position: absolute;
            border: 1px solid transparent;
            border-radius: 2px;
            cursor: text;
            user-select: none;
            z-index: 10;
            transition: border-color .1s;
            /* pointer-events managed by JS (none by default, auto when editing) */
        }

        /* Hover: show faint outline so user knows what's clickable.
           NOTE: boxes have pointer-events:none — the 'hovered' class is
           toggled by the overlay's mousemove handler in pdf-editor.js */
        .text-box.hovered {
            border-color: rgba(233, 69, 96, .4);
            background: rgba(233, 69, 96, .04);
        }

        /* Editing: active white box with red border */
        .text-box.editing {
            border: 1.5px solid #e94560;
            z-index: 50;
            cursor: text;
            background: #fff;
            overflow: visible;   /* allow drag handle to sit above box */
        }

        /* ── Drag handle (visible only when editing) ── */
        .text-box-drag-handle {
            display: none;
            position: absolute;
            top: -22px;
            left: 0;
            height: 20px;
            min-width: 64px;
            max-width: 140px;
            background: #e94560;
            border-radius: 4px 4px 0 0;
            cursor: grab;
            align-items: center;
            justify-content: center;
            gap: 4px;
            font-size: 11px;
            font-weight: 600;
            color: #fff;
            user-select: none;
            padding: 0 8px;
            white-space: nowrap;
            z-index: 70;
        }
        .text-box.editing  .text-box-drag-handle { display: flex; }
        .text-box.modified .text-box-drag-handle { background: #0f9b58; }
        .text-box.dragging .text-box-drag-handle { cursor: grabbing !important; }

        /* Modified (saved, not currently editing): green border */
        .text-box.modified {
            border-color: rgba(15, 155, 88, .6);
        }
        .text-box.modified.hovered {
            border-color: rgba(15, 155, 88, 1);
        }
        .text-box.modified.editing {
            border-color: #0f9b58;
        }

        /* Dragging */
        .text-box.dragging {
            cursor: grabbing !important;
            opacity: .9;
        }

        /* ── Text content inside the box ── */
        .text-box-content {
            width: 100%;
            height: 100%;
            outline: none;
            font-family: Helvetica, Arial, sans-serif;
            line-height: 1.15;
            white-space: nowrap;
            overflow: hidden;
            /* Transparent by default — original PDF text shows through */
            color: transparent;
            background: transparent;
            padding: 0;
            margin: 0;
        }

        /* Modified: fully opaque white covers original PDF text */
        .text-box.modified .text-box-content {
            color: #000 !important;
            background: #fff;
        }

        /* Editing: opaque, auto-expand allowed */
        .text-box.editing .text-box-content {
            color: #000 !important;
            background: #fff;
            white-space: nowrap;
            overflow: visible;
            cursor: text;
        }

        /* ── Resize handles ── */
        .resize-handle {
            display: none;
            position: absolute;
            width: 8px;
            height: 8px;
            background: #e94560;
            border: 1px solid #fff;
            border-radius: 1px;
            z-index: 60;
        }

        .text-box.editing .resize-handle {
            display: block;
        }

        .text-box.modified.editing .resize-handle {
            background: #0f9b58;
        }

        /* Handle positions */
        .rh-nw { top: -4px;    left: -4px;   cursor: nwse-resize; }
        .rh-ne { top: -4px;    right: -4px;  cursor: nesw-resize; }
        .rh-sw { bottom: -4px; left: -4px;   cursor: nesw-resize; }
        .rh-se { bottom: -4px; right: -4px;  cursor: nwse-resize; }
        .rh-n  { top: -4px;    left: 50%;  transform: translateX(-50%); cursor: ns-resize; }
        .rh-s  { bottom: -4px; left: 50%;  transform: translateX(-50%); cursor: ns-resize; }
        .rh-w  { top: 50%;     left: -4px; transform: translateY(-50%); cursor: ew-resize; }
        .rh-e  { top: 50%;     right: -4px; transform: translateY(-50%); cursor: ew-resize; }

        /* Overlay container */
        #overlay-container {
            pointer-events: none; /* JS sets to auto after building */
        }

        /* Loading spinner */
        #loading {
            display: none;
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, .6);
            align-items: center;
            justify-content: center;
            z-index: 999;
            flex-direction: column;
            gap: 16px;
        }

        #loading.show {
            display: flex;
        }

        .spinner {
            width: 48px;
            height: 48px;
            border: 4px solid #333;
            border-top-color: #e94560;
            border-radius: 50%;
            animation: spin .8s linear infinite;
        }

        @keyframes spin {
            to {
                transform: rotate(360deg);
            }
        }

        /* Toast */
        #toast {
            position: fixed;
            bottom: 24px;
            right: 24px;
            background: #333;
            color: #fff;
            padding: 12px 20px;
            border-radius: 8px;
            font-size: 14px;
            opacity: 0;
            transform: translateY(12px);
            transition: all .3s;
            z-index: 1000;
        }

        #toast.show {
            opacity: 1;
            transform: translateY(0);
        }

        #toast.success {
            border-left: 4px solid #0f9b58;
        }

        #toast.error {
            border-left: 4px solid #e94560;
        }
    </style>
</head>

<body>
    <div id="loading">
        <div class="spinner"></div>
        <span id="loading-text">Processing...</span>
    </div>
    <div id="toast"></div>
    <div id="topbar">
        <h1>📄 PDF Editor</h1>
        <span id="file-name" style="color:#888;font-size:13px;"></span>
        <button class="btn btn-outline" id="btn-reset" style="display:none">Upload New</button>
        <button class="btn btn-success" id="btn-save" style="display:none" disabled>💾 Save & Download</button>
    </div>
    <div id="drop-zone">
        <div class="icon">📁</div>
        <h2>Drop your PDF here</h2>
        <p>or click to browse</p>
        <button class="btn btn-primary" onclick="document.getElementById('file-input').click()">
            Choose PDF File
        </button>
        <input type="file" id="file-input" accept=".pdf" style="display:none">
    </div>
    <div id="editor-layout">
        <div id="sidebar">
            <h3>Pages</h3>
            <div id="page-thumbs"></div>
        </div>
        <div id="canvas-area">
            <div id="pdf-wrapper">
                <canvas id="pdf-canvas"></canvas>
                <div id="overlay-container"></div>
            </div>
        </div>
    </div>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
    <script src="{{ asset('js/pdf-editor.js') }}"></script>
</body>

</html>
