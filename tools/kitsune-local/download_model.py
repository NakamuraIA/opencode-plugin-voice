import os
import sys

from huggingface_hub import hf_hub_download

target = sys.argv[1] if len(sys.argv) > 1 else "model"
os.makedirs(target, exist_ok=True)
for name in ("kitsune39M.onnx", "model_config.json"):
    print(hf_hub_download("Heitorkk2/Kitsune-TTS-V1", name, local_dir=target))
