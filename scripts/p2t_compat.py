"""Launch Pix2Text with a compatibility alias for RapidOCR 3.10+.

CnSTD 1.2.8 imports resolve_model_key, while RapidOCR 3.10 renamed it to
route_to_model_key. Keep the alias scoped to this process so the virtualenv
does not need a hand-edited site-packages directory.
"""

import os
from pathlib import Path

project_root = Path(__file__).resolve().parents[1]
cache_root = project_root / ".cache"
os.environ.setdefault("PIX2TEXT_HOME", str(cache_root / "pix2text"))
os.environ.setdefault("CNSTD_HOME", str(cache_root / "cnstd"))
os.environ.setdefault("MPLCONFIGDIR", str(cache_root / "matplotlib"))
os.environ.setdefault("YOLO_CONFIG_DIR", str(cache_root / "ultralytics"))

from rapidocr.utils import model_resolver

if not hasattr(model_resolver, "resolve_model_key"):
    model_resolver.resolve_model_key = model_resolver.route_to_model_key

from pix2text.cli import cli


if __name__ == "__main__":
    cli()
