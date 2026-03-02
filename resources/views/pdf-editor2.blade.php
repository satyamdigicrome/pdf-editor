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

        .text-overlay {
            position: absolute;
            background: transparent;
            border: 1px solid transparent;
            cursor: text;
            padding: 0;
            margin: 0;
            outline: none;
            color: transparent;
            font-family: Helvetica, Arial, sans-serif;
            line-height: 1;
            white-space: nowrap;
            overflow: hidden;
            transition: border-color .15s, background .15s;
            z-index: 10;
        }

        .text-overlay:hover {
            border-color: rgba(233, 69, 96, .5);
            background: rgba(233, 69, 96, .08);
        }

        .text-overlay:focus {
            border-color: #e94560;
            background: rgba(255, 255, 255, .95);
            color: #000;
            z-index: 20;
        }

        .text-overlay.modified {
            color: #000 !important;
            background: rgba(255, 255, 255, 0.92);
            border-color: rgba(15, 155, 88, .7);
            border-radius: 2px;
        }

        .text-overlay.modified:hover {
            border-color: rgba(15, 155, 88, 1);
            background: rgba(255, 255, 255, 0.96);
        }

        .text-overlay.modified:focus {
            background: rgba(255, 255, 255, .95);
            color: #000;
            border-color: #0f9b58;
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
