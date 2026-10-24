"""Published standard-price estimates for supported standard Vertex models.

Source checked 2026-10-24:
https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing
Account-specific search allowances, billing discounts, taxes and invoice adjustments
require billing reconciliation. Include published introductory prices and cached inputs.
"""

from datetime import date


def token_rates(model: str, location: str, day: date) -> tuple[int, int] | None:
    """Micro-USD per million tokens. Unknown models must never be priced as Flash."""
    if model == "gemini-4-argon":
        input_rate, output_rate = ((2_000_000, 10_000_000) if day < date(2026, 12, 1)
                                   else (4_000_000, 20_000_000))
    elif model in ("gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash"):
        input_rate, output_rate = (750_000, 3_750_000)
        if day >= date(2027, 1, 1):
            input_rate, output_rate = (1_500_000, 7_500_000)
    else:
        return None
    if location != "global":
        input_rate, output_rate = input_rate * 11 // 10, output_rate * 11 // 10
    return input_rate, output_rate


def estimate_cost(
    rates: tuple[int, int],
    input_tokens: int,
    output_tokens: int,
    thought_tokens: int,
    total_tokens: int,
    search_queries: int,
    cached_input_tokens: int = 0,
    cached_input_rate: int | None = None,
) -> int | None:
    counts = (input_tokens, output_tokens, thought_tokens, total_tokens, search_queries)
    if cached_input_tokens < 0 or cached_input_tokens > input_tokens:
        return None
    if min(counts) < 0 or total_tokens < input_tokens + output_tokens + thought_tokens:
        return None
    # Price any tokens not classified by the provider at the higher token rate.
    remainder = total_tokens - input_tokens - output_tokens - thought_tokens
    numerator = (
        (input_tokens - cached_input_tokens) * rates[0]
        + cached_input_tokens * (cached_input_rate if cached_input_rate is not None else rates[0])
        + (output_tokens + thought_tokens) * rates[1]
        + remainder * max(rates)
    )
    return (numerator + 999_999) // 1_000_000 + search_queries * 14_000
