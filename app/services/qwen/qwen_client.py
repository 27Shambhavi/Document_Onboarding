from app.services.qwen.client import UnifiedQwenClient, qwen_client

QwenClient = UnifiedQwenClient
__all__ = ["qwen_client", "QwenClient", "UnifiedQwenClient"]