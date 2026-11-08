---
name: MediaSuite AI Agent Skill
description: Master prompt and API reference for AI Agents and Autonomous Systems integrating with the MediaSuite 2.0 Media Engine (Micro-Operations, Macro-Pipelines, FFmpeg, Whisper STT, Edge-TTS, and MCP).
version: 2.1.0
author: WEBLIFETECH (Jonnathan Peña)
base_url: https://media.weblifetech.com
---

# 🤖 MEDIASUITE 2.0 — AI AGENT INTEGRATION SKILL

> **Role & Purpose:** You are connected to **MediaSuite 2.0**, the centralized high-performance media engine of WEBLIFETECH.
> This engine executes heavy FFmpeg processing, Whisper speech-to-text, Edge-TTS neural speech synthesis, Suno AI music generation, and complete autonomous media pipelines without consuming CPU on client servers.

---

## 🔑 1. AUTHENTICATION & ACCESS MODES

MediaSuite supports two operational authentication modes:

### A. Enterprise / Internal Unlimited Mode (Master Key)
Used by brother platforms (e.g., Aikrofy, WhatsApp Transporters, Internal Workers). Bypasses token deduction with unlimited consumption.
* **Header:** `Authorization: Bearer <EXTERNAL_API_KEY>` or `X-API-Key: <EXTERNAL_API_KEY>`
* **Default Value:** Configured in `.env` as `EXTERNAL_API_KEY` (`wlt_sec_...`)

### B. Developer / Commercial Token Economy Mode (Dev API Key)
Used by external SaaS clients, developers, and third-party systems. Deducts tokens per operation based on the dynamic cost model.
* **Header:** `Authorization: Bearer ms_dev_<token>` or `X-API-Key: ms_dev_<token>`
* **Token Balance Management:** Balances can be recharged via `/api/dev/tokens/buy` or plan subscriptions.

---

## ⚡ 2. CORE CAPABILITIES (MICRO vs. MACRO OPERATIONS)

```
┌────────────────────────────────────────────────────────────────────────┐
│                        MEDIASUITE 2.0 ENGINE                           │
├───────────────────────────────────┬────────────────────────────────────┤
│ 🔹 MICRO-OPERATIONS (/api/micro)   │ 🔹 MACRO-PIPELINES (/api/*)        │
│ Atomic, synchronous FFmpeg tools  │ Complex async multi-agent flows    │
│ - Audio Convert, Trim, Speed, Pitch│ - /api/shorts (AI Video Shorts)    │
│ - LUFS Normalization (EBU R128)   │ - /api/audiobooks (PDF to Book)    │
│ - Voice & Background Music Mix    │ - /api/studio (Suno AI Music)      │
│ - Whisper STT & Edge-TTS Speech   │ - /api/animation (Remotion Studio) │
│ - Video Scale, Crop, Subtitle Burn│ - /api/covers (AI Album Art)       │
│ - Scene Detection & Ken Burns FX  │ - /api/mcp (Model Context Protocol)│
└───────────────────────────────────┴────────────────────────────────────┘
```

---

## 🎙️ 3. AUDIO & SPEECH ENDPOINTS

### 1. Transcribe Audio (Whisper Speech-to-Text)
* **Endpoint:** `POST /api/external/transcribe` or `POST /api/micro/audio/transcribe`
* **Content-Type:** `multipart/form-data`
* **Parameters:**
  * `file`: Audio file binary (MP3, WAV, WebM, OGG, M4A, AAC, Opus, FLAC).
  * `language`: (Optional) 2-letter ISO code (`es`, `en`, `pt`, `fr`) or `auto`.
* **Sample Response:**
  ```json
  {
    "status": "success",
    "filename": "audio.webm",
    "text": "Hola, necesito información sobre las citas disponibles.",
    "words": [
      {"word": "Hola,", "start": 0.0, "end": 0.4},
      {"word": "necesito", "start": 0.45, "end": 0.8}
    ]
  }
  ```

### 2. Neural Text-to-Speech (Edge-TTS)
* **Endpoint:** `POST /api/tts/speak`
* **Content-Type:** `application/json`
* **Body:**
  ```json
  {
    "text": "Hola, bienvenido a nuestro asistente virtual.",
    "voice": "es-MX-DaliaNeural",
    "rate": "+0%",
    "pitch": "+0Hz"
  }
  ```
* **Response:** Streaming audio (`audio/mpeg`).

### 3. Normalize Audio (LUFS EBU R128)
* **Endpoint:** `POST /api/micro/audio/normalize`
* **Parameters:** `file` (UploadFile), `target_lufs` (float, default `-14.0`)
* **Response:** Processed audio file (`audio/mpeg`).

### 4. Mix Voice with Background Music
* **Endpoint:** `POST /api/micro/audio/mix`
* **Parameters:**
  * `voice_file`: Main voice track.
  * `bg_file`: Background music track.
  * `voice_vol`: Voice volume multiplier (e.g. `1.0`).
  * `bg_vol`: Background volume multiplier (e.g. `0.15`).
* **Response:** Mastered mixed audio file.

---

## 🎬 4. VIDEO & MEDIA MICRO-OPERATIONS

| Endpoint | Method | Purpose | Key Parameters |
|---|---|---|---|
| `/api/micro/audio/info` | `POST` | Inspect audio metadata | `file` |
| `/api/micro/video/info` | `POST` | Inspect video resolution, fps, codec | `file` |
| `/api/micro/media/detect-scenes` | `POST` | Detect scene cuts in video | `file`, `threshold` (`0.4`) |
| `/api/micro/video/crop` | `POST` | Crop video dimensions | `file`, `w`, `h`, `x`, `y` |
| `/api/micro/video/burn-subtitles` | `POST` | Burn SRT/ASS into video | `file`, `srt_file`, `style` |
| `/api/micro/video/generate-waveform` | `POST` | Generate animated waveform from audio | `file`, `style`, `color` |
| `/api/micro/video/generate-ken-burns` | `POST` | Animate image into video clip | `image_file`, `duration`, `zoom` |

---

## 🤖 5. AGENT INTEGRATION EXAMPLES

### Python (httpx / requests)
```python
import os
import requests

MEDIA_URL = "https://media.weblifetech.com"
API_KEY = os.getenv("EXTERNAL_API_KEY", "wlt_sec_...")

# 1. Transcribe Voice Note
def transcribe_voice(file_path: str, lang: str = "es") -> str:
    headers = {"Authorization": f"Bearer {API_KEY}"}
    with open(file_path, "rb") as f:
        files = {"file": (os.path.basename(file_path), f, "audio/webm")}
        data = {"language": lang}
        res = requests.post(f"{MEDIA_URL}/api/external/transcribe", headers=headers, files=files, data=data)
        res.raise_for_status()
        return res.json().get("text", "")

# 2. Text to Speech
def generate_speech(text: str, output_path: str):
    res = requests.post(
        f"{MEDIA_URL}/api/tts/speak",
        json={"text": text, "voice": "es-MX-DaliaNeural"}
    )
    with open(output_path, "wb") as f:
        f.write(res.content)
```

### TypeScript / Node.js (Fetch)
```typescript
const MEDIA_URL = "https://media.weblifetech.com";
const API_KEY = process.env.EXTERNAL_API_KEY;

export async function transcribeAudio(audioBuffer: Buffer, filename: string): Promise<string> {
  const formData = new FormData();
  const blob = new Blob([audioBuffer]);
  formData.append("file", blob, filename);

  const response = await fetch(`${MEDIA_URL}/api/external/transcribe`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${API_KEY}` },
    body: formData,
  });

  const data = await response.json();
  return data.text;
}
```

---

## 🧩 6. MCP SERVER CONNECTION (FOR CLAUDE / CURSOR / AGENTS)

MediaSuite exposes its entire tool catalog over the **Model Context Protocol (MCP)**:
* **SSE Endpoint:** `https://media.weblifetech.com/api/mcp`
* **Discovery Endpoint:** `GET /api/dev/docs/tools`
* **Authentication:** Pass your API Key in the MCP configuration client.
