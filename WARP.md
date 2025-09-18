# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Architecture Overview

This is a **Tauri desktop application** that uploads images as tiled layouts to a server. The architecture consists of:

- **Frontend**: React + TypeScript + Vite with Tailwind CSS styling
- **Backend**: Rust (Tauri) with async tile processing and HTTP upload functionality
- **Package Manager**: pnpm

### Key Components

**Frontend (`src/`)**
- `App.tsx` - Main React component handling UI, drag-and-drop, progress tracking, and state management
- Uses Tauri's `invoke()` API to communicate with Rust backend
- Handles file selection, server configuration, and real-time progress updates

**Backend (`src-tauri/src/`)**  
- `main.rs` - Core Rust logic with Tauri commands and tile processing engine
- `lib.rs` - Basic Tauri setup (minimal, real implementation is in main.rs)
- `TileProcessor` struct handles image resizing, tiling, and batch HTTP uploads
- Shared state management for progress tracking and cancellation

### Data Flow

1. User configures server details (server|layout_key|secret format)
2. User selects/drops image file
3. Frontend calls `start_processing` Tauri command
4. Rust backend:
   - Loads and processes image at multiple zoom levels
   - Generates tiles with background color padding
   - Uploads tiles via HTTP multipart requests
   - Updates progress state asynchronously
5. Frontend polls progress and displays real-time updates
6. Backend finalizes upload with server API call

## Development Commands

### Setup
```bash
pnpm install
```

### Development
```bash
# Start development server with hot reload
pnpm run tauri dev

# Clean build (removes all dependencies and rebuilds)
./cleanbuild.sh
```

### Building
```bash
# Build frontend only
pnpm run build

# Build Tauri app for production
pnpm run tauri build
```

### Rust Development
```bash
# Work with Rust backend
cd src-tauri

# Check Rust code
cargo check

# Run Rust tests (if any)
cargo test

# Clean Rust build artifacts
cargo clean
```

## Key Technical Details

### Tauri Commands
The app defines these Rust functions callable from JavaScript:
- `select_image_file()` - File picker dialog
- `start_processing(config)` - Main tile processing workflow
- `get_progress()` - Returns current processing progress
- `cancel_processing()` - Stops processing gracefully  
- `read_file_as_bytes(path)` - File reading utility

### State Management
- **Frontend**: React hooks for UI state, real-time progress polling
- **Backend**: Arc<Mutex<>> for thread-safe progress and cancellation state

### Image Processing Pipeline
1. Load image and determine optimal zoom levels
2. For each zoom level (highest to lowest):
   - Resize image with Lanczos filtering
   - Add padding with configurable background color
   - Split into tiles of specified size (default 256px)
   - Convert tiles to JPEG format
   - Upload each tile to server endpoint
3. Finalize upload with API call containing layout metadata

### Configuration Format
Server details use pipe-separated format: `server_url|layout_key|secret`
Example: `https://api.example.com|my_layout|abc123`

## File Structure Notes

- `src-tauri/tauri.conf.json` - Tauri app configuration and build settings
- `cleanbuild.sh` - Complete dependency cleanup and rebuild script
- Frontend uses Vite on port 1420 (required by Tauri)
- Rust backend uses tokio for async operations and reqwest for HTTP