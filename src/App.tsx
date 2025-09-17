import React, { useState, useEffect, useRef } from 'react';
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

const ProgressBar = ({ progress }: { progress: ProgressUpdate }) => {
	return (
		<div className="progress-overlay">
			<div className="progress-container">
				<div className="progress-header">
					<span className="progress-status">{progress.status}</span>
					<span className="progress-percentage">{progress.percentage}%</span>
				</div>
				<div className="progress-bar-wrapper">
					<div className="progress-bar-fill" style={{ width: `${progress.percentage}%` }}>
						<div className="progress-bar-shine"></div>
					</div>
				</div>
				<div className="progress-stats">
					Zoom Level: {progress.zoom_level} | Tiles: {progress.current}/{progress.total}
				</div>
			</div>
		</div>
	);
};

const FeedbackScreen = ({ message, isSuccess, onReset }: {
	message: string;
	isSuccess: boolean;
	onReset: () => void;
}) => {
	return (
		<div className="feedback-overlay">
			<div className="feedback-container">
				<div className={`feedback-icon ${isSuccess ? 'success' : 'error'}`}>
					{isSuccess ? '✓' : '✗'}
				</div>
				<div className="feedback-message">{message}</div>
				<button onClick={onReset} className="btn-primary">
					{isSuccess ? 'Process Another Image' : 'Try Again'}
				</button>
			</div>
		</div>
	);
};

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
	const [showFeedback, setShowFeedback] = useState(false);
	const [feedbackMessage, setFeedbackMessage] = useState('');
	const [feedbackSuccess, setFeedbackSuccess] = useState(false);
	const [dragOver, setDragOver] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		let interval: NodeJS.Timeout;
		let progressValue = 0;

		if (processing) {
			interval = setInterval(() => {
				progressValue += Math.random() * 5;
				if (progressValue >= 100) {
					progressValue = 100;
					setProcessing(false);
					setProgress(null);
					setShowFeedback(true);
					setFeedbackMessage('Image tiles processed and uploaded successfully!');
					setFeedbackSuccess(true);
				} else {
					const mockProgress: ProgressUpdate = {
						current: Math.floor((progressValue / 100) * 85) + Math.floor(Math.random() * 15),
						total: 100,
						zoom_level: Math.floor(progressValue / 20) + 1,
						percentage: Math.floor(progressValue),
						status: progressValue < 30 ? 'Processing tiles' :
							progressValue < 70 ? 'Uploading' : 'Generating thumbnails'
					};
					setProgress(mockProgress);
				}
			}, 200);
		}

		return () => {
			if (interval) clearInterval(interval);
		};
	}, [processing]);

	const handleDrop = (e: React.DragEvent) => {
		e.preventDefault();
		setDragOver(false);
		const files = Array.from(e.dataTransfer.files);
		const imageFile = files.find(file => file.type.startsWith('image/'));
		if (imageFile) {
			setConfig(prev => ({ ...prev, image_path: imageFile.name }));
		}
	};

	const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (file) {
			setConfig(prev => ({ ...prev, image_path: file.name }));
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
		} else {
			setConfig(prev => ({
				...prev,
				server_address: address,
				layout_key: '',
				secret: '',
			}));
		}
	};

	const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const hex = e.target.value;
		const r = parseInt(hex.slice(1, 3), 16);
		const g = parseInt(hex.slice(3, 5), 16);
		const b = parseInt(hex.slice(5, 7), 16);
		setConfig(prev => ({ ...prev, background_color: [r, g, b] }));
	};

	const rgbToHex = (r: number, g: number, b: number) => {
		return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
	};

	const startProcessing = () => {
		if (!config.image_path || !config.server_address || !config.layout_key || !config.secret) {
			setShowFeedback(true);
			setFeedbackMessage('Please fill in all required fields and select an image.');
			setFeedbackSuccess(false);
			return;
		}

		setProcessing(true);
		setProgress(null);
	};

	const cancelProcessing = () => {
		setProcessing(false);
		setProgress(null);
	};

	const resetApp = () => {
		setShowFeedback(false);
		setConfig({
			image_path: '',
			server_address: '',
			layout_key: '',
			secret: '',
			background_color: [0, 0, 0],
			tile_size: 256,
		});
		if (fileInputRef.current) {
			fileInputRef.current.value = '';
		}
	};

	return (
		<div className="app-container">
			<div className="main-card">
				<h1 className="app-title">Image Tile Uploader</h1>

				{/* Server Configuration */}
				<div className="form-section">
					<label className="form-label">Server Configuration</label>
					<input
						type="text"
						className="form-input"
						placeholder="https://example.com|layout_key|secret"
						onChange={(e) => parseServerAddress(e.target.value)}
						disabled={processing}
					/>
					<small className="form-hint">Format: server|layout_key|secret</small>
				</div>

				{/* Settings Row */}
				<div className="settings-row">
					<div className="form-section">
						<label className="form-label">Background Color</label>
						<div className="color-input-group">
							<input
								type="color"
								className="color-picker"
								value={rgbToHex(...config.background_color)}
								onChange={handleColorChange}
								disabled={processing}
							/>
							<input
								type="text"
								className="form-input color-text"
								value={`${config.background_color[0]},${config.background_color[1]},${config.background_color[2]}`}
								placeholder="R,G,B"
								onChange={(e) => {
									const parts = e.target.value.split(',').map(s => parseInt(s.trim()));
									if (parts.length === 3 && parts.every(n => !isNaN(n) && n >= 0 && n <= 255)) {
										setConfig(prev => ({ ...prev, background_color: parts as [number, number, number] }));
									}
								}}
								disabled={processing}
							/>
						</div>
					</div>

					<div className="form-section">
						<label className="form-label">Tile Size</label>
						<input
							type="number"
							className="form-input"
							value={config.tile_size}
							onChange={(e) => setConfig(prev => ({ ...prev, tile_size: parseInt(e.target.value) || 256 }))}
							min="64"
							max="1024"
							disabled={processing}
						/>
					</div>
				</div>

				{/* Drag & Drop Area */}
				<div
					className={`drop-zone ${dragOver ? 'drag-over' : ''} ${config.image_path ? 'has-file' : ''}`}
					onDrop={handleDrop}
					onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
					onDragLeave={() => setDragOver(false)}
					onClick={() => fileInputRef.current?.click()}
				>
					<input
						ref={fileInputRef}
						type="file"
						accept="image/*"
						onChange={handleFileSelect}
						style={{ display: 'none' }}
						disabled={processing}
					/>

					{config.image_path ? (
						<div className="file-selected">
							<div className="file-icon">📷</div>
							<div className="file-name">{config.image_path}</div>
							<div className="file-hint">Click to change or drag new image</div>
						</div>
					) : (
						<div className="drop-content">
							<div className="drop-icon">⬆️</div>
							<div className="drop-text">Drag & drop your image here</div>
							<div className="drop-subtext">or click to browse</div>
						</div>
					)}
				</div>

				{/* Action Buttons */}
				<div className="action-buttons">
					<button
						onClick={startProcessing}
						disabled={processing || !config.image_path}
						className="btn-success"
					>
						{processing ? 'Processing...' : 'Start Processing'}
					</button>

					{processing && (
						<button onClick={cancelProcessing} className="btn-secondary">
							Cancel
						</button>
					)}
				</div>

				{/* Progress Overlay */}
				{progress && <ProgressBar progress={progress} />}

				{/* Feedback Overlay */}
				{showFeedback && (
					<FeedbackScreen
						message={feedbackMessage}
						isSuccess={feedbackSuccess}
						onReset={resetApp}
					/>
				)}
			</div>
		</div>
	);
}

export default App;