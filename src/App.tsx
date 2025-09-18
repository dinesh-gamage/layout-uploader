import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import './App.css';

interface ProcessConfig {
    image_path: string;
    server_address: string;
    layout_key: string;
    secret: string;
    background_color: [number, number, number];
    tile_size: number;
}

interface ProgressUpdate {
    current: number;
    total: number;
    zoom_level: number;
    percentage: number;
    status: string;
}

const DefaultConfig: ProcessConfig = {
    image_path: '',
    server_address: '',
    layout_key: '',
    secret: '',
    background_color: [0, 0, 0],
    tile_size: 256,
}

type AppState = 'idle' | 'processing' | 'completed' | 'error';

function App() {
    const [config, setConfig] = useState<ProcessConfig>(DefaultConfig);
    const [progress, setProgress] = useState<ProgressUpdate | null>(null);
    const [appState, setAppState] = useState<AppState>('idle');
    const [message, setMessage] = useState('');
    const [serverInput, setServerInput] = useState('');
    const [dragActive, setDragActive] = useState(false);
    const [imagePreview, setImagePreview] = useState<string | null>(null);

    const dropRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let interval: NodeJS.Timeout;

        if (appState === 'processing') {
            interval = setInterval(async () => {
                try {
                    const progressData = await invoke<ProgressUpdate | null>('get_progress');
                    if (progressData) {
                        setProgress(progressData);
                        // Only handle cancellation from progress if we're still in processing state
                        // This prevents overriding manual cancellation state changes
                        if (progressData.status === 'Cancelled' && appState === 'processing') {
                            setAppState('idle');
                            setMessage('Processing was cancelled.');
                        }
                    }
                } catch (error) {
                    console.error('Failed to get progress:', error);
                }
            }, 500);
        }

        return () => {
            if (interval) clearInterval(interval);
        };
    }, [appState]);

    useEffect(() => {

        const unlistenDrop = listen('tauri://drag-drop', (event) => {
            setDragActive(false)
            const dropData = event.payload as { paths: string[], position: { x: number, y: number } };

            if (dropData && dropData.paths && dropData.paths.length > 0) {
                const filePath = dropData.paths[0];
                setConfig(prev => ({ ...prev, image_path: filePath }));

                invoke<number[]>('read_file_as_bytes', { path: filePath })
                    .then(fileData => {
                        const uint8Array = new Uint8Array(fileData);
                        const blob = new Blob([uint8Array]);
                        const dataUrl = URL.createObjectURL(blob);
                        setImagePreview(dataUrl);
                    })
                    .catch((error) => {
                        setImagePreview(null);
                    });
            }
        });

        const unlistenDragEnter = listen('tauri://drag-enter', () => {
            setDragActive(true)
        });

        const unlistenDragLeave = listen('tauri://drag-leave', () => {
            setDragActive(false)
        });

        return () => {
            console.log('Cleaning up Tauri file drag &drop listener');
            unlistenDrop.then(f => f());
            unlistenDragEnter.then(f => f());
            unlistenDragLeave.then(f => f());
        };
    }, []);

    const selectImage = async () => {
        try {
            const selected = await invoke<string | null>('select_image_file');
            if (selected) {
                setConfig(prev => ({ ...prev, image_path: selected }));
                try {
                    const fileData = await invoke<number[]>('read_file_as_bytes', { path: selected });
                    const uint8Array = new Uint8Array(fileData);
                    const blob = new Blob([uint8Array]);
                    const dataUrl = URL.createObjectURL(blob);
                    setImagePreview(dataUrl);
                    setMessage('');
                } catch (readError) {
                    console.error('Failed to read file for preview:', readError);
                    setImagePreview(null);
                }
            }
        } catch (error) {
            console.error('Failed to select image:', error);
            setMessage('Failed to select image file.');
        }
    };

    const parseServerAddress = (address: string) => {
        setServerInput(address);
        const parts = address.split('|');
        if (parts.length === 3) {
            setConfig(prev => ({
                ...prev,
                server_address: parts[0],
                layout_key: parts[1],
                secret: parts[2],
            }));
        }
    };

    const handleColorChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const hex = event.target.value;
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        setConfig(prev => ({ ...prev, background_color: [r, g, b] }));
    };

    const rgbToHex = (r: number, g: number, b: number) => {
        return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    };

    const startProcessing = async () => {
        if (!config.image_path || !config.server_address || !config.layout_key || !config.secret) {
            setMessage('Please fill in all required fields.');
            return;
        }

        // Clear any previous state
        setAppState('processing');
        setProgress({ current: 0, total: 0, zoom_level: 0, percentage: 0, status: 'Starting...' });
        setMessage('');

        try {
            const result = await invoke<string>('start_processing', { config });
            setMessage(result);
            setAppState(result.toLowerCase().includes('success') ? 'completed' : 'error');
        } catch (error) {
            setMessage(`Error: ${error}`);
            setAppState('error');
        }
    };

    const cancelProcessing = async () => {
        try {
            await invoke('cancel_processing');
            // Immediately update the UI state to show cancellation
            setAppState('idle');
            setMessage('Processing was cancelled.');
            setProgress(null);
        } catch (error) {
            console.error('Failed to cancel:', error);
            setMessage('Failed to cancel processing.');
        }
    };

    const resetApp = () => {
        setAppState('idle');
        setMessage('');
        setProgress(null);
    };

    const startFresh = () => {
        setConfig({
            image_path: '',
            server_address: '',
            layout_key: '',
            secret: '',
            background_color: [0, 0, 0],
            tile_size: 256,
        });
        setServerInput('');
        setImagePreview(null);
        resetApp();
        setDragActive(false)
    };

    const getFileName = (path: string) => {
        return path.split('/').pop() || path.split('\\').pop() || path;
    };

    return (
        <div className="app">
            <div className="container">
                <div className="header">
                    <h1 className="title">Layout Uploader</h1>
                </div>

                {/* Top Controls */}
                <div className="top-controls">
                    <div className="input-group">
                        <label className="input-label">Server Details (server|layout_key|secret)</label>
                        <input
                            type="text"
                            className="text-input"
                            placeholder="https://example.com|your_layout_key|your_secret"
                            value={serverInput}
                            onChange={(e) => parseServerAddress(e.target.value)}
                            disabled={appState === 'processing'}
                        />
                    </div>

                    <div className="input-group">
                        <label className="input-label">Background Color</label>
                        <button
                            className="color-picker-btn"
                            onClick={() => document.getElementById('colorPicker')?.click()}
                            disabled={appState === 'processing'}
                        >
                            <div
                                className="color-preview"
                                style={{ backgroundColor: rgbToHex(...config.background_color) }}
                            />
                            Color
                        </button>
                        <input
                            id="colorPicker"
                            type="color"
                            className="hidden-color-input"
                            value={rgbToHex(...config.background_color)}
                            onChange={handleColorChange}
                        />
                    </div>

                    <div className="input-group">
                        <label className="input-label">Tile Size</label>
                        <input
                            type="number"
                            className="text-input small-input"
                            value={config.tile_size}
                            onChange={(e) => setConfig(prev => ({ ...prev, tile_size: parseInt(e.target.value) || 256 }))}
                            min="64"
                            max="1024"
                            disabled={appState === 'processing'}
                        />
                    </div>
                </div>

                {/* Image Section - Updated with drag and drop */}
                <div className="image-section">
                    <div className="input-group">
                        <label className="input-label">Image File</label>
                        <div className="image-upload-area">
                            <div
                                ref={dropRef}
                                className={`drop-zone ${dragActive ? 'drag-active' : ''} ${config.image_path ? 'has-image' : ''}`}
                                onClick={appState !== 'processing' ? selectImage : undefined}
                            >
                                {(imagePreview || !!getFileName(config.image_path)) ? (
                                    <div className="image-preview-container">
                                        <div style={{ backgroundImage: `url(${imagePreview})` }} className="image-preview" >
                                            {!imagePreview && <div className='no-preview' >No preview available</div>}
                                        </div>
                                        <div className="image-overlay">
                                            <div className="image-name">{getFileName(config.image_path)}</div>
                                            <div className="drop-hint">Click to change or drop new image</div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="drop-zone-content">
                                        <div className="drop-icon">📁</div>
                                        <div className="drop-text">
                                            <div>Drag & drop an image here</div>
                                            <div className="drop-subtext">or click to select</div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Action Button */}
                <div className="action-section">
                    <button
                        className="main-btn"
                        onClick={startProcessing}
                        disabled={appState === 'processing' || !config.image_path || !config.server_address || !config.secret || !config.layout_key || !config.background_color || !config.tile_size}
                    >
                        Start Processing
                    </button>
                    <button className="second-btn" onClick={startFresh}>
                        Cancel
                    </button>
                </div>

                {/* Message display */}
                {message && (
                    <div className={`message ${message.includes('Error') || message.includes('Failed') ? 'error' : 'info'}`}>
                        {message}
                    </div>
                )}

                {/* Progress Overlay */}
                {appState === 'processing' && (
                    <div className="progress-overlay">
                        <div className="progress-content">
                            <h2 className="progress-title">Processing Image</h2>

                            {progress && (
                                <>
                                    <div className="progress-percentage">{Math.round(progress.percentage)}%</div>
                                    <div className="progress-bar-container">
                                        <div
                                            className="progress-bar"
                                            style={{ width: `${Math.max(0, Math.min(100, progress.percentage))}%` }}
                                        />
                                    </div>
                                    <div className="progress-details">
                                        <div>{progress.status}</div>
                                        <div>Tiles: {progress.current}/{progress.total}</div>
                                    </div>
                                </>
                            )}

                            <button className="cancel-btn" onClick={cancelProcessing}>
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                {/* Completion/Error Overlay */}
                {(appState === 'completed' || appState === 'error') && (
                    <div className="completion-overlay">
                        <div className="completion-content">
                            <h2 className={`completion-title ${appState}`}>
                                {appState === 'completed' ? 'Upload Complete!' : 'Upload Failed'}
                            </h2>
                            <div className="completion-message">{message}</div>
                            <div className="completion-actions">
                                {appState === 'error' ? (
                                    <button className="main-btn" onClick={resetApp}>
                                        Go Back
                                    </button>
                                ) : (
                                    <button className="main-btn" onClick={startFresh}>
                                        Done
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default App;