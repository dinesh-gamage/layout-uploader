#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use image::imageops::FilterType;
use image::{ImageBuffer, ImageFormat, Rgba, RgbaImage};
use reqwest;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tauri::State;
use tokio::sync::Mutex;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
struct ProcessConfig {
    image_path: String,
    server_address: String,
    layout_key: String,
    secret: String,
    background_color: (u8, u8, u8),
    tile_size: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ProgressUpdate {
    current: u32,
    total: u32,
    zoom_level: u32,
    percentage: u32,
    status: String,
}

type ProgressState = Arc<Mutex<Option<ProgressUpdate>>>;
type CancelState = Arc<Mutex<bool>>;

struct TileProcessor {
    tile_size: u32,
}

impl TileProcessor {
    fn new(tile_size: u32) -> Self {
        Self { tile_size }
    }

    fn calc_zoom(&self, zoom_level: u32, width: u32, height: u32) -> f64 {
        let ts = (2_u32.pow(zoom_level)) * self.tile_size;
        let max_dimension = width.max(height);
        ts as f64 / max_dimension as f64
    }

    fn get_max_zoom_levels(&self, width: u32, height: u32) -> u32 {
        let max_dimension = width.max(height);
        let tiles = (max_dimension as f64 / self.tile_size as f64).ceil();
        (tiles.log2().ceil() as u32) + 1
    }

    async fn process_tiles(
        &self,
        config: &ProcessConfig,
        progress_state: ProgressState,
        cancel_state: CancelState,
    ) -> Result<u32, String> {
        // Reset cancel state
        *cancel_state.lock().await = false;

        // Load and convert image
        let img =
            image::open(&config.image_path).map_err(|e| format!("Failed to open image: {}", e))?;

        let img = img.to_rgba8();
        let (img_width, img_height) = img.dimensions();
        let zoom_levels = self.get_max_zoom_levels(img_width, img_height);

        // Calculate total tiles
        let mut total_tiles = 0;
        for i in 0..zoom_levels {
            total_tiles += 4_u32.pow(i);
        }

        let layout_path = Uuid::new_v4().to_string();
        let mut current_tile = 0;
        let mut max_zoom = 0;

        // Process each zoom level
        for zoom_level in (0..zoom_levels).rev() {
            if *cancel_state.lock().await {
                *progress_state.lock().await = Some(ProgressUpdate {
                    current: 0,
                    total: 0,
                    zoom_level: 0,
                    percentage: 0,
                    status: "Cancelled".to_string(),
                });
                return Err("Processing cancelled".to_string());
            }

            max_zoom = max_zoom.max(zoom_level);
            let scale_factor = self.calc_zoom(zoom_level, img_width, img_height);

            // Resize image
            let new_width = (img_width as f64 * scale_factor) as u32;
            let new_height = (img_height as f64 * scale_factor) as u32;

            let scaled_img =
                image::imageops::resize(&img, new_width, new_height, FilterType::Lanczos3);

            // Calculate padding
            let tile_count = 2_u32.pow(zoom_level);
            let total_width = tile_count * self.tile_size;

            let extra_width = total_width.saturating_sub(new_width);
            let extra_height = total_width.saturating_sub(new_height);

            // Create padded image
            let padded_width = new_width + extra_width;
            let padded_height = new_height + extra_height;

            let mut padded_img: RgbaImage = ImageBuffer::from_pixel(
                padded_width,
                padded_height,
                Rgba([
                    config.background_color.0,
                    config.background_color.1,
                    config.background_color.2,
                    255,
                ]),
            );

            // Paste scaled image
            let x_offset = extra_width / 2;
            let y_offset = extra_height / 2;

            image::imageops::overlay(
                &mut padded_img,
                &scaled_img,
                x_offset as i64,
                y_offset as i64,
            );

            // Generate tiles
            let tiles_x = padded_width / self.tile_size;
            let tiles_y = padded_height / self.tile_size;

            for tile_x in 0..tiles_x {
                for tile_y in 0..tiles_y {
                    if *cancel_state.lock().await {
                        *progress_state.lock().await = Some(ProgressUpdate {
                            current: 0,
                            total: 0,
                            zoom_level: 0,
                            percentage: 0,
                            status: "Cancelled".to_string(),
                        });
                        return Err("Processing cancelled".to_string());
                    }

                    let x = tile_x * self.tile_size;
                    let y = tile_y * self.tile_size;

                    // Extract tile and convert to RGB
                    let tile = image::imageops::crop_imm(
                        &padded_img,
                        x,
                        y,
                        self.tile_size,
                        self.tile_size,
                    );
                    let rgb_tile = image::DynamicImage::ImageRgba8(tile.to_image()).to_rgb8();

                    // Convert to JPEG
                    let mut jpeg_data = Vec::new();
                    rgb_tile
                        .write_to(&mut std::io::Cursor::new(&mut jpeg_data), ImageFormat::Jpeg)
                        .map_err(|e| format!("Failed to encode JPEG: {}", e))?;

                    // Upload tile
                    let url = format!(
                        "{}/LayoutUtil/UploadTile/{}/{}/{}/{}/{}?__sc__={}",
                        config.server_address.trim_end_matches('/'),
                        config.layout_key,
                        layout_path,
                        zoom_level,
                        x,
                        y,
                        config.secret
                    );

                    self.upload_tile(&url, &jpeg_data)
                        .await
                        .map_err(|e| format!("Upload failed: {}", e))?;

                    current_tile += 1;

                    // Update progress
                    let percentage = (current_tile * 100) / total_tiles;
                    let progress = ProgressUpdate {
                        current: current_tile,
                        total: total_tiles,
                        zoom_level,
                        percentage,
                        status: format!(
                            "Processing zoom level {} ({}/{})",
                            zoom_level, current_tile, total_tiles
                        ),
                    };

                    *progress_state.lock().await = Some(progress);
                }
            }
        }

        // Final cancellation check before finalize
        if *cancel_state.lock().await {
            *progress_state.lock().await = Some(ProgressUpdate {
                current: 0,
                total: 0,
                zoom_level: 0,
                percentage: 0,
                status: "Cancelled".to_string(),
            });
            return Err("Processing cancelled".to_string());
        }

        // Finalize upload
        self.finalize_upload(
            &config.server_address,
            &config.layout_key,
            &layout_path,
            &config.secret,
            max_zoom,
        )
        .await
        .map_err(|e| format!("Failed to finalize upload: {}", e))?;

        Ok(max_zoom)
    }

    async fn upload_tile(&self, url: &str, data: &[u8]) -> Result<(), reqwest::Error> {
        let client = reqwest::Client::new();
        let part = reqwest::multipart::Part::bytes(data.to_vec())
            .file_name("tile.jpg")
            .mime_str("image/jpeg")
            .unwrap();

        let form = reqwest::multipart::Form::new().part("file", part);

        client
            .post(url)
            .header("User-Agent", "SDLayoutUploader-Tauri")
            .multipart(form)
            .send()
            .await?
            .error_for_status()?;

        Ok(())
    }

    async fn finalize_upload(
        &self,
        server: &str,
        layout_key: &str,
        layout_path: &str,
        secret: &str,
        max_zoom: u32,
    ) -> Result<(), reqwest::Error> {
        let url = format!(
            "{}/api/Location/LocationLayout/UpdatePath",
            server.trim_end_matches('/')
        );

        let max_zoom_str = max_zoom.to_string();
        let mut params = HashMap::new();
        params.insert("LayoutKey", layout_key);
        params.insert("LayoutPath", layout_path);
        params.insert("apikey", secret);
        params.insert("MaxZoom", &max_zoom_str);

        let client = reqwest::Client::new();
        client
            .get(&url)
            .header("User-Agent", "SDLayoutUploader-Tauri")
            .query(&params)
            .send()
            .await?
            .error_for_status()?;

        Ok(())
    }
}

#[tauri::command]
async fn select_image_file() -> Result<Option<String>, String> {
    use rfd::AsyncFileDialog;

    let file = AsyncFileDialog::new()
        .add_filter("Images", &["png", "jpg", "jpeg", "gif", "bmp", "webp"])
        .set_title("Select Image File")
        .pick_file()
        .await;

    match file {
        Some(file_handle) => Ok(Some(file_handle.path().to_string_lossy().to_string())),
        None => Ok(None),
    }
}

#[tauri::command]
async fn start_processing(
    config: ProcessConfig,
    progress_state: State<'_, ProgressState>,
    cancel_state: State<'_, CancelState>,
) -> Result<String, String> {
    // Clear any previous state before starting new processing
    *cancel_state.lock().await = false;
    *progress_state.lock().await = Some(ProgressUpdate {
        current: 0,
        total: 0,
        zoom_level: 0,
        percentage: 0,
        status: "Starting...".to_string(),
    });
    
    let processor = TileProcessor::new(config.tile_size);

    match processor
        .process_tiles(
            &config,
            progress_state.inner().clone(),
            cancel_state.inner().clone(),
        )
        .await
    {
        Ok(max_zoom) => Ok(format!(
            "Processing completed successfully! Max zoom level: {}",
            max_zoom
        )),
        Err(e) => Err(e),
    }
}

#[tauri::command]
async fn get_progress(
    progress_state: State<'_, ProgressState>,
) -> Result<Option<ProgressUpdate>, ()> {
    Ok(progress_state.lock().await.clone())
}

#[tauri::command]
async fn cancel_processing(
    progress_state: State<'_, ProgressState>,
    cancel_state: State<'_, CancelState>,
) -> Result<(), ()> {
    *cancel_state.lock().await = true;
    *progress_state.lock().await = Some(ProgressUpdate {
        current: 0,
        total: 0,
        zoom_level: 0,
        percentage: 0,
        status: "Cancelling...".to_string(),
    });
    Ok(())
}

#[tauri::command]
async fn read_file_as_bytes(path: String) -> Result<Vec<u8>, String> {
    std::fs::read(&path).map_err(|e| format!("Failed to read file: {}", e))
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .manage(ProgressState::new(Mutex::new(None)))
        .manage(CancelState::new(Mutex::new(false)))
        .invoke_handler(tauri::generate_handler![
            select_image_file,
            start_processing,
            get_progress,
            cancel_processing,
            read_file_as_bytes
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
