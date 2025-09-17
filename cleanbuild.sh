#!/usr/bin/env bash
set -e

echo "🧹 Cleaning previous builds..."
rm -rf node_modules
rm -f pnpm-lock.yaml
cd src-tauri
rm -f Cargo.lock
cargo clean
cd ..

echo "📦 Installing dependencies..."
pnpm install

echo "🚀 Starting Tauri dev..."
pnpm run tauri dev
