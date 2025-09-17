import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
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

type AppState = 'idle' | 'processing' | 'completed' | 'error';

function App() {
  const [config, setConfig] = useState<ProcessConfig>({
    image_path: '',
    server_address: '',
    layout_key: '',
    secret: '',
    background_color: [0, 0, 0],
    tile_size: 256,
  });

  const [progress, setProgress] = useState<ProgressUpdate | null>(null);
  const [appState, setAppState] = useState<AppState>('idle');
  const [message, setMessage] = useState('');
  const [serverInput, setServerInput] = useState('');

  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (appState === 'processing') {
      interval = setInterval(async () => {
        try {
          const progressData = await invoke<ProgressUpdate | null>('get_progress');
          if (progressData) {
            setProgress(progressData);
            if (progressData.status === 'Cancelled') {
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

  const selectImage = async () => {
    try {
      const selected = await invoke<string | null>('select_image_file');
      if (selected) {
        setConfig(prev => ({ ...prev, image_path: selected }));
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
      setMessage('Cancelling...');
    } catch (error) {
      console.error('Failed to cancel:', error);
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
    resetApp();
  };

  const getFileName = (path: string) => {
    return path.split('/').pop() || path.split('\\').pop() || path;
  };

  return (
    <div className="app">
      <div className="container">
        <div className="header">
          <h1 className="title">Floor Layout Uploader</h1>
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

        {/* Image Selection */}
        <div className="image-section">
          <div className="input-group">
            <label className="input-label">Image File</label>
            <div className="image-controls">
              <button
                className="select-btn"
                onClick={selectImage}
                disabled={appState === 'processing'}
              >
                Select Image
              </button>
              <div className="image-path">
                {config.image_path ? getFileName(config.image_path) : 'No image selected'}
              </div>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div className="action-section">
          <button
            className="main-btn"
            onClick={startProcessing}
            disabled={appState === 'processing' || !config.image_path}
          >
            Start Processing
          </button>
        </div>

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