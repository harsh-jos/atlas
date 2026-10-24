"""Models users can select when starting a conversation."""
from typing import Literal

ChatModel = Literal["gemini-4-argon", "gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash"]
CHAT_MODELS = ("gemini-4-argon", "gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash")
