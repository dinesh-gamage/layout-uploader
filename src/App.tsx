import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

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
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (processing) {
      interval = setInterval(async () => {
        try {
          const progressData = await invoke<ProgressUpdate | null>('get_progress');
          if (progressData) {
            setProgress(progressData);
            if (progressData.status === 'Cancelled') {
              setProcessing(false);
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
  }, [processing]);

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

  const startProcessing = async () => {
    if (!config.image_path || !config.server_address || !config.layout_key || !config.secret) {
      setMessage('Please fill in all required fields.');
      return;
    }

    setProcessing(true);
    setProgress(null);
    setMessage('');

    try {
      const result = await invoke<string>('start_processing', { config });
      setMessage(result);
    } catch (error) {
      setMessage(`Error: ${error}`);
    } finally {
      setProcessing(false);
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

  const parseColor = (colorStr: string) => {
    const parts = colorStr.split(',').map(s => parseInt(s.trim()));
    if (parts.length === 3 && parts.every(n => !isNaN(n) && n >= 0 && n <= 255)) {
      setConfig(prev => ({ ...prev, background_color: parts as [number, number, number] }));
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-md p-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Image Tile Uploader</h1>

        <div className="space-y-6">
          {/* Image Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Image File
            </label>
            <div className="flex gap-3">
              <button
                onClick={selectImage}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                Select Image
              </button>
              <span className="flex-1 px-3 py-2 bg-gray-100 rounded-md text-sm text-gray-600 truncate">
                {config.image_path || 'No image selected'}
              </span>
            </div>
          </div>

          {/* Server Configuration */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Server Address (format: server|layout_key|secret)
            </label>
            <input
              type="text"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="https://example.com|your_layout_key|your_secret"
              onChange={(e) => parseServerAddress(e.target.value)}
            />
          </div>

          {/* Configuration Options */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Background Color (R,G,B)
              </label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0,0,0"
                defaultValue="0,0,0"
                onChange={(e) => parseColor(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tile Size (pixels)
              </label>
              <input
                type="number"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={config.tile_size}
                onChange={(e) => setConfig(prev => ({ ...prev, tile_size: parseInt(e.target.value) || 256 }))}
                min="64"
                max="1024"
              />
            </div>
          </div>

          {/* Current Configuration Display */}
          {config.server_address && (
            <div className="bg-gray-100 p-4 rounded-md">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Current Configuration:</h3>
              <div className="text-sm text-gray-600 space-y-1">
                <div><strong>Server:</strong> {config.server_address}</div>
                <div><strong>Layout Key:</strong> {config.layout_key}</div>
                <div><strong>Background:</strong> RGB({config.background_color.join(', ')})</div>
                <div><strong>Tile Size:</strong> {config.tile_size}px</div>
              </div>
            </div>
          )}

          {/* Progress Display */}
          {progress && (
            <div className="bg-blue-50 p-4 rounded-md">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-blue-900">Processing...</span>
                <span className="text-sm text-blue-600">{progress.percentage}%</span>
              </div>
              <div className="w-full bg-blue-200 rounded-full h-2 mb-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress.percentage}%` }}
                />
              </div>
              <div className="text-sm text-blue-700">
                <div>{progress.status}</div>
                <div>Tiles: {progress.current}/{progress.total}</div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={startProcessing}
              disabled={processing}
              className="flex-1 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {processing ? 'Processing...' : 'Start Processing'}
            </button>

            {processing && (
              <button
                onClick={cancelProcessing}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
              >
                Cancel
              </button>
            )}
          </div>

          {/* Message Display */}
          {message && (
            <div className={`p-4 rounded-md ${message.includes('Error') || message.includes('Failed')
                ? 'bg-red-50 text-red-800 border border-red-200'
                : message.includes('successfully')
                  ? 'bg-green-50 text-green-800 border border-green-200'
                  : 'bg-yellow-50 text-yellow-800 border border-yellow-200'
              }`}>
              {message}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;