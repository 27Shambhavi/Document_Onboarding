import base64
import random
import time
from typing import Any, Dict, List, Tuple
from openai import OpenAI

from app.core.config import settings
from app.core.logger import get_logger

logger = get_logger(__name__)


class QwenClient:

  def __init__(self):
    self.client = OpenAI(
        base_url=settings.NVIDIA_BASE_URL,
        api_key=settings.NVIDIA_API_KEY,
    )
    self.model = settings.NVIDIA_MODEL

  def _execute_with_retry(
      self, messages: List[Dict[str, Any]], max_retries: int = 5
  ) -> str:
    """Executes a chat completion call with automatic exponential backoff for rate limits."""
    for attempt in range(1, max_retries + 1):
      try:
        response = self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=0.0,
            max_tokens=4096,
            extra_body={"chat_template_kwargs": {"enable_thinking": False}},
        )
        return response.choices[0].message.content

      except Exception as e:
        error_str = str(e).lower()
        is_rate_limit = any(
            k in error_str
            for k in ["429", "rate limit", "503", "unavailable", "too many"]
        )

        if attempt >= max_retries or not is_rate_limit:
          logger.exception("NVIDIA API call failed after retries")
          raise RuntimeError(f"NVIDIA API failed: {str(e)}")

        backoff = (2.0**attempt) + random.uniform(0.5, 1.5)
        logger.warning(
            f"[QWEN-CLIENT] Hit 429 Rate Limit. Backing off for {backoff:.2f}s"
            f" (Attempt {attempt}/{max_retries})..."
        )
        time.sleep(backoff)

  def chat(
      self,
      prompt: str,
      system_prompt: str = (
          "You are an enterprise document intelligence assistant."
      ),
  ) -> str:
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": prompt},
    ]
    return self._execute_with_retry(messages)

  def vision(
      self,
      image_bytes: bytes,
      prompt: str,
      system_prompt: str = (
          "You are an enterprise document vision intelligence system."
      ),
      image_format: str = "jpeg",
  ) -> str:
    """Single image vision inference with automatic base64 encoding."""
    encoded_image = base64.b64encode(image_bytes).decode("utf-8")
    image_data = f"data:image/{image_format};base64,{encoded_image}"

    messages = [
        {"role": "system", "content": system_prompt},
        {
            "role": "user",
            "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": image_data}},
            ],
        },
    ]
    return self._execute_with_retry(messages)

  # Method alias so any route calling vision_extract also succeeds
  def vision_extract(
      self,
      image_bytes: bytes,
      prompt: str,
      system_prompt: str = (
          "You are an enterprise document vision intelligence system."
      ),
      image_format: str = "jpeg",
  ) -> str:
    return self.vision(
        image_bytes=image_bytes,
        prompt=prompt,
        system_prompt=system_prompt,
        image_format=image_format,
    )

  def vision_multiple(
      self,
      images: List[Tuple[bytes, str]],
      prompt: str,
      system_prompt: str = (
          "You are an enterprise document intelligence system."
      ),
  ) -> str:
    """Multi-image vision inference."""
    content: List[Dict[str, Any]] = [{"type": "text", "text": prompt}]

    for image_bytes, image_format in images:
      encoded_image = base64.b64encode(image_bytes).decode("utf-8")
      image_data = f"data:image/{image_format};base64,{encoded_image}"
      content.append({"type": "image_url", "image_url": {"url": image_data}})

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": content},
    ]
    return self._execute_with_retry(messages)


qwen_client = QwenClient()