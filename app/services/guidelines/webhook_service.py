import asyncio
import httpx
from typing import Dict, Any
from app.schemas.guidelines import WebhookPayload


class WebhookService:

    @staticmethod
    async def dispatch_with_retry(
        webhook_url: str,
        payload: WebhookPayload,
        max_retries: int = 3,
        backoff_factor: float = 2.0,
    ) -> bool:
        """
        Delivers the final verified guideline payload to the client's webhook URL.
        Retries up to max_retries on transient network failures.
        """
        payload_dict = payload.model_dump()
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            for attempt in range(1, max_retries + 1):
                try:
                    response = await client.post(
                        webhook_url,
                        json=payload_dict,
                        headers={"Content-Type": "application/json"},
                    )
                    if response.status_code in [200, 201, 202, 204]:
                        print(f"[INFO] Successfully delivered webhook to {webhook_url} for request {payload.requestId}")
                        return True
                    else:
                        print(f"[WARNING] Webhook {webhook_url} returned HTTP {response.status_code} on attempt {attempt}")
                except Exception as exc:
                    print(f"[ERROR] Webhook delivery failure on attempt {attempt} to {webhook_url}: {str(exc)}")

                if attempt < max_retries:
                    await asyncio.sleep(backoff_factor ** attempt)

        print(f"[CRITICAL] Failed to deliver webhook payload to {webhook_url} after {max_retries} attempts.")
        return False


webhook_service = WebhookService()
