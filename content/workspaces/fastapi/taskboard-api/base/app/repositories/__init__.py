"""Repositories: every query the app runs, and nothing else. No rules, no HTTP.

A repository function takes the session first and returns models or plain values. When a
query needs a rule ("only the owner's projects"), the service decides and passes it in.
"""


def escape_like(text: str) -> str:
    """Makes `%`, `_`, and `\\` literal in a LIKE pattern, so `80%` matches only "80%"."""
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
