# Lawrite

Handwritten maths, typeset live for the room to read.

Lawrite uses a local Pix2Text service for handwritten math recognition. No OCR API key or paid service is required. The first recognition may take longer while Pix2Text downloads its model weights.

## Run locally

Use Python 3.12 (available as `python3.12` on Fedora) and Node.js:

```bash
cd latech
python3.12 -m venv .venv-ocr
source .venv-ocr/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements-ocr.txt
npm run ocr:serve
```

Keep that terminal running. In a second terminal, start the app:

```bash
cd latech
npm run dev
```

Open `/tablet` to draw and `/computer` for the projector view; `/` sends each device to the right one. Press **Recognize handwriting** to send a cropped image of the current ink to the local Pix2Text service. The LaTeX result can be edited before copying.

The Next.js server expects Pix2Text at `http://127.0.0.1:8503/pix2text`. To use another address, set `PIX2TEXT_URL` in the environment where Next.js runs.

### Repair an existing environment

The OCR startup script includes a small compatibility alias for installations where CnSTD 1.2.8 is paired with RapidOCR 3.10. On a machine with package-index access, you can also reinstall the compatible RapidOCR 3.9 release line:

```bash
.venv-ocr/bin/python -m pip install 'rapidocr>=3.9.1,<3.10'
npm run ocr:serve
```

## Notes

- Pix2Text is open source, but it runs locally and uses CPU/GPU and memory. Initial installation downloads Python packages; first service startup downloads model weights and needs internet access. Model caches go in the ignored `.cache/` directory in this project.
- Recognition runs on a cropped image of the whole canvas. Multiple equations may be returned together; review the output before using it.
- `requirements-ocr.txt` installs the optional Pix2Text HTTP service dependencies with `pix2text[serve]`.
