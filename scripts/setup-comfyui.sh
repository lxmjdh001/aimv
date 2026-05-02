#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMFY_DIR="$ROOT_DIR/ComfyUI"

if [ ! -d "$COMFY_DIR" ]; then
  git clone https://github.com/Comfy-Org/ComfyUI.git "$COMFY_DIR"
fi

cd "$COMFY_DIR"
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt

cat > extra_model_paths.yaml <<YAML
ai_mv:
  base_path: $ROOT_DIR/models
  checkpoints: checkpoints
  vae: vae
  loras: loras
  clip: clip
  unet: unet
  diffusion_models: diffusion_models
  text_encoders: text_encoders
YAML

echo "ComfyUI installed at $COMFY_DIR"
echo "Run: cd $COMFY_DIR && source .venv/bin/activate && python main.py --listen 127.0.0.1 --port 8188"
