import base64
import threading
import time

from openai import OpenAI

from app.core.config import settings
from app.core.logger import get_logger


logger = get_logger(__name__)


class QwenClient:

    # =========================================================
    # INITIALIZATION
    # =========================================================

    def __init__(self):

        # -----------------------------------------------------
        # Load API keys
        # -----------------------------------------------------

        self.api_keys = [
            key.strip()
            for key in settings.NVIDIA_API_KEYS.split(",")
            if key.strip()
        ]

        if not self.api_keys:

            raise ValueError(
                "No NVIDIA API keys configured. "
                "Set NVIDIA_API_KEYS in .env"
            )

        # -----------------------------------------------------
        # Current key index
        # -----------------------------------------------------

        self.current_key_index = 0

        # -----------------------------------------------------
        # Thread lock
        #
        # Your application processes pages concurrently,
        # therefore key rotation must be thread-safe.
        # -----------------------------------------------------

        self._lock = threading.Lock()

        # -----------------------------------------------------
        # Model
        # -----------------------------------------------------

        self.model = settings.NVIDIA_MODEL

        # -----------------------------------------------------
        # Create clients
        #
        # One OpenAI client per NVIDIA API key.
        # -----------------------------------------------------

        self.clients = [
            OpenAI(
                base_url=settings.NVIDIA_BASE_URL,
                api_key=api_key,
            )
            for api_key in self.api_keys
        ]

        logger.info(
            "NVIDIA Qwen client initialized with %d API keys",
            len(self.api_keys),
        )

    # =========================================================
    # GET CURRENT CLIENT
    # =========================================================

    def _get_client(self):

        with self._lock:

            index = self.current_key_index

            return (
                self.clients[index],
                index,
            )

    # =========================================================
    # ROTATE API KEY
    # =========================================================

    def _rotate_key(self):

        with self._lock:

            old_index = self.current_key_index

            self.current_key_index = (
                self.current_key_index + 1
            ) % len(self.clients)

            new_index = self.current_key_index

        logger.warning(
            "Rotating NVIDIA API key: %d -> %d",
            old_index + 1,
            new_index + 1,
        )

    # =========================================================
    # COMMON REQUEST EXECUTOR
    # =========================================================

    def _request(
        self,
        messages,
        max_tokens: int = 4096,
        temperature: float = 0,
        max_attempts: int | None = None,
    ):

        if max_attempts is None:

            max_attempts = len(
                self.clients
            )

        attempted_keys = set()

        last_error = None

        # -----------------------------------------------------
        # Try each available key
        # -----------------------------------------------------

        for attempt in range(
            max_attempts
        ):

            client, key_index = (
                self._get_client()
            )

            # -------------------------------------------------
            # Avoid retrying same key within one request
            # -------------------------------------------------

            if key_index in attempted_keys:

                self._rotate_key()

                continue

            attempted_keys.add(
                key_index
            )

            try:

                logger.info(
                    "NVIDIA request using API key #%d",
                    key_index + 1,
                )

                response = (
                    client.chat.completions.create(
                        model=self.model,
                        messages=messages,
                        temperature=temperature,
                        max_tokens=max_tokens,
                        extra_body={
                            "chat_template_kwargs": {
                                "enable_thinking": False
                            }
                        },
                    )
                )

                return response

            except Exception as e:

                last_error = e

                error_text = str(
                    e
                ).lower()

                logger.warning(
                    "NVIDIA API key #%d failed: %s",
                    key_index + 1,
                    str(e),
                )

                # =============================================
                # RATE LIMIT
                # =============================================

                if (
                    "429" in error_text
                    or "rate limit" in error_text
                    or "too many requests"
                    in error_text
                ):

                    logger.warning(
                        "Rate limit detected "
                        "on NVIDIA API key #%d",
                        key_index + 1,
                    )

                    self._rotate_key()

                    continue

                # =============================================
                # AUTHENTICATION / INVALID KEY
                # =============================================

                if (
                    "401" in error_text
                    or "unauthorized"
                    in error_text
                    or "invalid api key"
                    in error_text
                    or "authentication"
                    in error_text
                ):

                    logger.warning(
                        "Authentication failure "
                        "on NVIDIA API key #%d",
                        key_index + 1,
                    )

                    self._rotate_key()

                    continue

                # =============================================
                # SERVER / TEMPORARY ERROR
                # =============================================

                if (
                    "500" in error_text
                    or "502" in error_text
                    or "503" in error_text
                    or "504" in error_text
                    or "timeout" in error_text
                    or "timed out" in error_text
                ):

                    logger.warning(
                        "Temporary NVIDIA failure "
                        "on API key #%d",
                        key_index + 1,
                    )

                    time.sleep(0.5)

                    self._rotate_key()

                    continue

                # =============================================
                # UNKNOWN ERROR
                #
                # Try next key rather than killing the
                # complete document immediately.
                # =============================================

                logger.warning(
                    "Unknown NVIDIA API failure. "
                    "Trying next API key."
                )

                self._rotate_key()

        # -----------------------------------------------------
        # All keys failed
        # -----------------------------------------------------

        logger.exception(
            "All NVIDIA API keys failed"
        )

        raise RuntimeError(
            "All configured NVIDIA API keys failed. "
            f"Last error: {last_error}"
        )

    # =========================================================
    # TEXT GENERATION
    # =========================================================

    def chat(
        self,
        prompt: str,
        system_prompt: str = (
            "You are an enterprise document "
            "intelligence assistant."
        ),
    ) -> str:

        messages = [
            {
                "role": "system",
                "content": system_prompt,
            },
            {
                "role": "user",
                "content": prompt,
            },
        ]

        try:

            response = self._request(
                messages=messages,
                temperature=0,
                max_tokens=4096,
            )

            return (
                response
                .choices[0]
                .message
                .content
            )

        except Exception as e:

            logger.exception(
                "NVIDIA text API error"
            )

            raise RuntimeError(
                f"NVIDIA Text API failed: {str(e)}"
            )

    # =========================================================
    # SINGLE IMAGE VISION
    # =========================================================

    def vision(
        self,
        image_bytes: bytes,
        prompt: str,
        system_prompt: str = (
            "You are an enterprise document "
            "vision intelligence system."
        ),
        image_format: str = "jpeg",
    ) -> str:

        # -----------------------------------------------------
        # Encode image
        # -----------------------------------------------------

        encoded_image = (
            base64.b64encode(
                image_bytes
            ).decode("utf-8")
        )

        image_data = (
            f"data:image/{image_format};base64,"
            f"{encoded_image}"
        )

        messages = [
            {
                "role": "system",
                "content": system_prompt,
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": prompt,
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": image_data
                        },
                    },
                ],
            },
        ]

        try:

            response = self._request(
                messages=messages,
                temperature=0,
                max_tokens=4096,
            )

            return (
                response
                .choices[0]
                .message
                .content
            )

        except Exception as e:

            logger.exception(
                "NVIDIA vision API error"
            )

            raise RuntimeError(
                f"NVIDIA Vision API failed: {str(e)}"
            )

    # =========================================================
    # MULTI-IMAGE VISION
    # =========================================================

    def vision_multiple(
        self,
        images: list[tuple[bytes, str]],
        prompt: str,
        system_prompt: str = (
            "You are an enterprise document "
            "intelligence system."
        ),
    ) -> str:

        # -----------------------------------------------------
        # Build message content
        # -----------------------------------------------------

        content = [
            {
                "type": "text",
                "text": prompt,
            }
        ]

        # -----------------------------------------------------
        # Add all images
        # -----------------------------------------------------

        for image_bytes, image_format in images:

            encoded_image = (
                base64.b64encode(
                    image_bytes
                ).decode("utf-8")
            )

            image_data = (
                f"data:image/{image_format};base64,"
                f"{encoded_image}"
            )

            content.append(
                {
                    "type": "image_url",
                    "image_url": {
                        "url": image_data
                    },
                }
            )

        messages = [
            {
                "role": "system",
                "content": system_prompt,
            },
            {
                "role": "user",
                "content": content,
            },
        ]

        try:

            response = self._request(
                messages=messages,
                temperature=0,
                max_tokens=4096,
            )

            return (
                response
                .choices[0]
                .message
                .content
            )

        except Exception as e:

            logger.exception(
                "NVIDIA multi-image API error"
            )

            raise RuntimeError(
                f"NVIDIA Vision API failed: {str(e)}"
            )


# =============================================================
# GLOBAL CLIENT
# =============================================================

qwen_client = QwenClient()