import base64

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

        try:

            response = (
                self.client.chat.completions.create(
                    model=self.model,
                    messages=[
                        {
                            "role": "system",
                            "content": system_prompt,
                        },
                        {
                            "role": "user",
                            "content": prompt,
                        },
                    ],
                    temperature=0,
                    max_tokens=4096,
                    extra_body={
                        "chat_template_kwargs": {
                            "enable_thinking": False
                        }
                    },
                )
            )

            return response.choices[
                0
            ].message.content

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

        try:

            encoded_image = (
                base64.b64encode(
                    image_bytes
                ).decode("utf-8")
            )

            image_data = (
                f"data:image/{image_format};base64,"
                f"{encoded_image}"
            )

            response = (
                self.client.chat.completions.create(
                    model=self.model,
                    messages=[
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
                    ],
                    temperature=0,
                    max_tokens=4096,
                    extra_body={
                        "chat_template_kwargs": {
                            "enable_thinking": False
                        }
                    },
                )
            )

            return response.choices[
                0
            ].message.content

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

        try:

            # ---------------------------------------------
            # Start message content with text prompt
            # ---------------------------------------------

            content = [
                {
                    "type": "text",
                    "text": prompt,
                }
            ]

            # ---------------------------------------------
            # Add every document page
            # ---------------------------------------------

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

            # ---------------------------------------------
            # Send all images together
            # ---------------------------------------------

            response = (
                self.client.chat.completions.create(
                    model=self.model,
                    messages=[
                        {
                            "role": "system",
                            "content": system_prompt,
                        },
                        {
                            "role": "user",
                            "content": content,
                        },
                    ],
                    temperature=0,
                    max_tokens=4096,
                    extra_body={
                        "chat_template_kwargs": {
                            "enable_thinking": False
                        }
                    },
                )
            )

            return response.choices[
                0
            ].message.content

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