#!/bin/bash

# Usage:
# ./generate_icon.sh <source_png> <output_path> <type> <min_size> <max_size>
# type = icns | ico
# min_size and max_size are optional (default: 16 and 512)

SOURCE_PNG="$1"
OUTPUT_PATH="$2"
TYPE="$3"
MIN_SIZE="${4:-16}"
MAX_SIZE="${5:-512}"

if [[ ! -f "$SOURCE_PNG" ]]; then
    echo "Source PNG not found: $SOURCE_PNG"
    exit 1
fi

if [[ "$TYPE" != "icns" && "$TYPE" != "ico" ]]; then
    echo "Type must be 'icns' or 'ico'"
    exit 1
fi

# Create temporary folder
TMP_DIR=$(mktemp -d)
ICONSET_DIR="$TMP_DIR/iconset"
mkdir -p "$ICONSET_DIR"

# Generate sizes
# For icns, macOS expects: 16,32,64,128,256,512,1024
# For ico, Windows typically expects: 16,32,48,64,128,256
if [[ "$TYPE" == "icns" ]]; then
    SIZES=(16 32 64 128 256 512 1024)
else
    SIZES=(16 32 48 64 128 256)
fi

# Filter sizes based on min/max
FILTERED_SIZES=()
for SIZE in "${SIZES[@]}"; do
    if (( SIZE >= MIN_SIZE && SIZE <= MAX_SIZE )); then
        FILTERED_SIZES+=($SIZE)
    fi
done

echo "Generating ${TYPE} with sizes: ${FILTERED_SIZES[*]}"

# Resize images
for SIZE in "${FILTERED_SIZES[@]}"; do
    OUTPUT_FILE="$ICONSET_DIR/icon_${SIZE}x${SIZE}.png"
    if command -v sips &>/dev/null; then
        # macOS
        sips -z $SIZE $SIZE "$SOURCE_PNG" --out "$OUTPUT_FILE" >/dev/null
    else
        # Linux/Windows via ImageMagick
        magick "$SOURCE_PNG" -resize ${SIZE}x${SIZE} "$OUTPUT_FILE"
    fi
done

# Generate output
if [[ "$TYPE" == "icns" ]]; then
    iconutil -c icns "$ICONSET_DIR" -o "$OUTPUT_PATH"
    echo "Generated ICNS: $OUTPUT_PATH"
else
    # Pack PNGs into ICO
    PNG_FILES=$(ls -v "$ICONSET_DIR"/*.png)
    magick $PNG_FILES "$OUTPUT_PATH"
    echo "Generated ICO: $OUTPUT_PATH"
fi

# Clean up
rm -rf "$TMP_DIR"
