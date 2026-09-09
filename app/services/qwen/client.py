import asyncio
import base64
import logging
import time
from io import BytesIO
import httpx
from openai import AsyncOpenAI
from PIL import Image

# Correct absolute import based on your project structure
from app.core.config import settings

logger = logging.getLogger("vllm_client")

class UnifiedQwenClient:
    def __init__(self):
        # Pulling configurations directly from your centralized settings
        self.api_key = settings.OPENAI_API_KEY
        self.base_url = settings.OPENAI_BASE_URL
        self.vision_model = settings.NVIDIA_VISION_MODEL
        self.text_model = settings.GUIDELINE_MODEL
        
        self.client = AsyncOpenAI(
            base_url=self.base_url,
            api_key=self.api_key,
            timeout=httpx.Timeout(120.0, connect=20.0), # Extended for heavy 32B model processing
            max_retries=3,
        )

        # Safe concurrency to manage GPU load
        self._gate = asyncio.Semaphore(4)  
        self._min_interval = 0.2  
        self._last_call_timestamp = 0.0

    async def _throttle(self):
        now = time.time()
        elapsed = now - self._last_call_timestamp
        if elapsed < self._min_interval:
            await asyncio.sleep(self._min_interval - elapsed)
        self._last_call_timestamp = time.time()

    def _optimize_image(self, image_bytes: bytes, max_size: int = 512) -> str:
        with Image.open(BytesIO(image_bytes)) as img:
            if img.mode != "RGB":
                img = img.convert("RGB")
            # Downscales massive document scans to prevent context window overflow
            img.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
            buffer = BytesIO()
            img.save(buffer, format="JPEG", quality=60, optimize=True)
            return base64.b64encode(buffer.getvalue()).decode("utf-8")

    async def vision_async(
        self,
        image_bytes: bytes,
        prompt: str,
        system_prompt: str = "You are an enterprise document extraction assistant.",
        max_retries: int = 3,
    ) -> str:
        b64_image = await asyncio.to_thread(self._optimize_image, image_bytes)
        
        messages = [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64_image}"}},
                    {"type": "text", "text": prompt},
                ],
            },
        ]

        async with self._gate:
            for attempt in range(1, max_retries + 1):
                await self._throttle()
                try:
                    response = await self.client.chat.completions.create(
                        model=self.vision_model,
                        messages=messages,
                        temperature=0.01,
                        max_tokens=512, # Increased to capture full JSON extraction payloads
                    )
                    return response.choices[0].message.content or "{}"
                except Exception as exc:
                    logger.error(f"[VISION ERROR] (Attempt {attempt}/{max_retries}) {exc}")
                    if attempt == max_retries:
                        break
                    await asyncio.sleep(2.0 * attempt)
        return "{}"

    async def chat_async(
        self,
        prompt: str,
        system_prompt: str = "You are an enterprise compliance auditor.",
        max_tokens: int = 1024,
        max_retries: int = 3,
    ) -> str:
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt},
        ]
        
        async with self._gate:
            for attempt in range(1, max_retries + 1):
                await self._throttle()
                try:
                    response = await self.client.chat.completions.create(
                        model=self.text_model,
                        messages=messages,
                        temperature=0.01,
                        max_tokens=max_tokens,
                    )
                    return response.choices[0].message.content or ""
                except Exception as exc:
                    logger.error(f"[CHAT ERROR] (Attempt {attempt}/{max_retries}) {exc}")
                    if attempt == max_retries:
                        break
                    await asyncio.sleep(1.0 * attempt)
        return ""

qwen_client = UnifiedQwenClient()