#!/bin/bash

# Task Manager Release Build Script
# This script builds the Tauri application for production

set -e  # Exit on any error

echo "🚀 Starting Task Manager release build..."
echo

# Step 1: Clean previous builds
echo "🧹 Cleaning previous builds..."
rm -rf dist/
rm -rf src-tauri/target/release/bundle/
rm -rf node_modules
cd src-tauri
cargo clean
cd ..
echo "✅ Cleaned previous builds"
echo

# Step 2: Install/update dependencies
echo "📦 Installing dependencies..."
pnpm install
echo "✅ Dependencies installed"
echo

# Step 3: Run tests and type checking
echo "🔍 Running type checks..."
pnpm run typecheck
echo "✅ Type checks passed"
echo

# Step 4: Build the Tauri application
echo "🔨 Building Tauri application..."
pnpm tauri build
echo "✅ Tauri build completed"
echo

# Step 5: Show build results
echo "📁 Build artifacts created:"
echo

# Check for macOS builds
if [ -d "src-tauri/target/release/bundle/macos" ]; then
    echo "🍎 macOS App Bundle:"
    ls -la "src-tauri/target/release/bundle/macos/"
    echo
fi

# Check for DMG
if [ -d "src-tauri/target/release/bundle/dmg" ]; then
    echo "💿 macOS DMG Installer:"
    ls -la "src-tauri/target/release/bundle/dmg/"
    echo
fi

# # Check for other platforms
# if [ -d "src-tauri/target/release/bundle/msi" ]; then
#     echo "🪟 Windows MSI:"
#     ls -la "src-tauri/target/release/bundle/msi/"
#     echo
# fi

# if [ -d "src-tauri/target/release/bundle/deb" ]; then
#     echo "🐧 Linux DEB:"
#     ls -la "src-tauri/target/release/bundle/deb/"
#     echo
# fi

# if [ -d "src-tauri/target/release/bundle/appimage" ]; then
#     echo "🐧 Linux AppImage:"
#     ls -la "src-tauri/target/release/bundle/appimage/"
#     echo
# fi

echo "🎉 Release build completed successfully!"
echo
echo "📍 Build artifacts are located in: src-tauri/target/release/bundle/"
echo
echo "To run the app:"
echo "  - macOS: Open the .app bundle or .dmg file"
# echo "  - Windows: Run the .msi installer" 
# echo "  - Linux: Install the .deb package or run the .AppImage"