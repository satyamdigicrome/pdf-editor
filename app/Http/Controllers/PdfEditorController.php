<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Storage;

class PdfEditorController extends Controller
{
    private string $pythonBin = 'python';
    private string $parsScript = '';
    private string $modifyScript = '';

    public function __construct()
    {
        $this->parsScript = base_path('python/parse_pdf.py');
        $this->modifyScript = base_path('python/modify_pdf.py');
    }
    public function index()
    {
        return view('pdf-editor2');
    }

    public function upload(Request $request)
    {
        $request->validate([
            'pdf' => 'required|file|mimes:pdf|max:20480'
        ]);
        $file = $request->file('pdf');
        $filename = Str::uuid() . '.pdf';
        $file->storeAs('pdfs/original', $filename, 'local');
        $fullPath = storage_path("app/pdfs/original/{$filename}");
        $raw = shell_exec("{$this->pythonBin} " . escapeshellarg($this->parsScript) . " " . escapeshellarg($fullPath) . " 2>&1");
        $result = json_decode($raw, true);
        if (!$result || !$result['success']) {
            return response()->json([
                'success' => false,
                'error' => $result['error'] ?? 'PDF parse failed'
            ], 500);
        }
        return response()->json([
            'success' => true,
            'filename' => $filename,
            'pages' => $result['pages']
        ]);
    }

    public function save(Request $request)
    {
        $request->validate([
            'filename' => 'required|string',
            'changes' => 'required|array'
        ]);

        $originalPath = storage_path("app/pdfs/original/{$request->filename}");
        if (!file_exists($originalPath)) {
            return response()->json(['success' => false, 'error' => 'Original file not found'], 404);
        }
        $modifiedDir = storage_path('app/pdfs/modified');
        if (!is_dir($modifiedDir)) {
            mkdir($modifiedDir, 0755, true);
        }
        $outputFilename = 'edited_' . $request->filename;
        $outputPath = "{$modifiedDir}/{$outputFilename}";
        $tempJsonPath = storage_path('app/pdfs/changes_' . uniqid() . '.json');
        file_put_contents($tempJsonPath, json_encode($request->changes));
        $raw = shell_exec(
            "{$this->pythonBin} " . escapeshellarg($this->modifyScript)
            . " " . escapeshellarg($originalPath)
            . " " . escapeshellarg($outputPath)
            . " " . escapeshellarg($tempJsonPath)
            . " 2>&1"
        );
        if (file_exists($tempJsonPath)) {
            unlink($tempJsonPath);
        }
        $result = json_decode($raw, true);

        if (!$result || !$result['success']) {
            return response()->json([
                'success' => false,
                'error' => $result['error'] ?? 'PDF modify failed. Raw: ' . $raw
            ], 500);
        }
        return response()->json([
            'success' => true,
            'download_url' => route('pdf.download', $outputFilename)
        ]);
    }


    public function download(string $filename)
    {
        $path = storage_path("app/pdfs/modified/{$filename}");
        abort_unless(file_exists($path), 404);
        return response()->download($path);
    }
}
