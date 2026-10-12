"""
Shared AI chat client for Zeralda ERP.
Routes to cloud provider depending on settings.
"""

from typing import Any, Dict, List, Optional
from backend.cloud_ai_service import chat_with_assistant_ai as _cloud_chat


def chat_with_assistant_ai(messages: List[Dict], system_prompt: Optional[str] = None, provider_override: Optional[str] = None, max_tokens: Optional[int] = None, temperature: Optional[float] = None) -> Dict[str, Any]:
    return _cloud_chat(messages, system_prompt=system_prompt, provider_override=provider_override, max_tokens=max_tokens, temperature=temperature)
