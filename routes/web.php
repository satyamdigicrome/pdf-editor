<?php

use App\Http\Controllers\Admin\AdminAuthController;
use App\Http\Controllers\Admin\StatementController;
use App\Http\Controllers\PdfEditorController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Web Routes
|--------------------------------------------------------------------------
|
| Here is where you can register web routes for your application. These
| routes are loaded by the RouteServiceProvider and all of them will
| be assigned to the "web" middleware group. Make something great!
|
*/

Route::get('/', function () {
    return view('welcome');
})->name('welcome');


Route::prefix('admin')->name('admin.')->group(function () {

    Route::get('/login', [AdminAuthController::class, 'showLogin'])
        ->name('login.form');

    Route::post('/login', [AdminAuthController::class, 'login'])
        ->name('login');

    Route::middleware('auth')->group(function () {

        Route::get('/dashboard', function () {
            return view('admin.dashboard');
        })->name('dashboard');

        Route::get('/new-statement', function () {
            return view('admin.statement');
        })->name('statement');

        Route::post('/logout', [AdminAuthController::class, 'logout'])
            ->name('logout');

        Route::post('/statement/upload', [StatementController::class, 'upload'])
            ->name('statement.upload');
    });
});

Route::get('/pdf-editor',            [PdfEditorController::class, 'index'])->name('pdf.editor');
Route::post('/pdf-editor/upload',    [PdfEditorController::class, 'upload'])->name('pdf.upload');
Route::post('/pdf-editor/save',      [PdfEditorController::class, 'save'])->name('pdf.save');
Route::get('/pdf-editor/download/{filename}', [PdfEditorController::class, 'download'])->name('pdf.download');
