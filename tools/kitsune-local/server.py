#!/usr/bin/env python3
"""OpenAI-compatible local server for the official Kitsune-TTS (ONNX).

Endpoints:
  GET  /health          -> status, model, sample rate, voices
  GET  /v1/voices       -> available voices
  POST /v1/audio/speech -> OpenAI-compatible TTS (returns audio/wav)

Environment:
  KITSUNE_MODEL    path to kitsune39M.onnx (default: ./model/kitsune39M.onnx)
  KITSUNE_PORT     port (default: 8092)
  KITSUNE_API_KEY  optional bearer token; when set, requests must send it
  KITSUNE_MAX_CHARS max input length (default: 1500)
"""
from __future__ import annotations

import io
import os
import wave

import numpy as np
from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.environ.get("KITSUNE_MODEL", os.path.join(BASE_DIR, "model", "kitsune39M.onnx"))
API_KEY = os.environ.get("KITSUNE_API_KEY", "").strip()
MAX_CHARS = int(os.environ.get("KITSUNE_MAX_CHARS", "1500"))

app = FastAPI(title="Kitsune TTS (local)", version="0.1.0")
synth = None


@app.on_event("startup")
def load_model() -> None:
    global synth
    from kitsune.api import KitsuneSynthesizer

    if not os.path.isfile(MODEL_PATH):
        raise RuntimeError(f"model not found: {MODEL_PATH}")
    synth = KitsuneSynthesizer(onnx_path=MODEL_PATH)
    print(f"Kitsune loaded: {synth.list_speakers()} @ {synth.sample_rate} Hz", flush=True)


class SpeechRequest(BaseModel):
    model: str | None = None
    input: str
    voice: str | None = "frieren"
    response_format: str | None = "wav"
    speed: float | None = 1.0
    instructions: str | None = None


def check_key(authorization: str | None) -> None:
    if not API_KEY:
        return
    if not authorization or authorization.strip() != f"Bearer {API_KEY}":
        raise HTTPException(status_code=401, detail="invalid API key")


@app.get("/health")
def health() -> dict:
    return {
        "ok": True,
        "model": os.path.basename(MODEL_PATH),
        "sample_rate": synth.sample_rate,
        "voices": synth.list_speakers(),
    }


@app.get("/v1/voices")
def voices() -> dict:
    return {"voices": synth.list_speakers()}


@app.post("/v1/audio/speech")
def speech(req: SpeechRequest, authorization: str | None = Header(default=None)) -> Response:
    check_key(authorization)

    text = (req.input or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="input is required")
    if len(text) > MAX_CHARS:
        raise HTTPException(status_code=413, detail=f"text too long (max {MAX_CHARS} chars)")

    available = synth.list_speakers()
    voice = (req.voice or "frieren").strip().lower()
    if voice not in available:
        raise HTTPException(status_code=400, detail=f"unknown voice '{voice}'; use one of {available}")

    speed = float(req.speed or 1.0)
    if not 0.5 <= speed <= 2.0:
        raise HTTPException(status_code=400, detail="speed must be between 0.5 and 2.0")

    audio = synth.synthesize(text, speaker=voice, length_scale=1.0 / speed)
    pcm = (np.clip(np.asarray(audio, dtype=np.float32), -1.0, 1.0) * 32767.0).astype(np.int16)

    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(synth.sample_rate)
        wav.writeframes(pcm.tobytes())

    return Response(content=buffer.getvalue(), media_type="audio/wav")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("KITSUNE_PORT", "8092")), log_level="info")
