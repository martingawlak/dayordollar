"""Minimal PHP unserialize() for the plugin's user meta and options: arrays of
strings, ints, floats, bools and nested arrays. Returns None if the value is not
serialized PHP, so plain strings pass through untouched."""
import re


def unserialize(s: str):
    if not isinstance(s, str) or not re.match(r"^(a|s|i|d|b|N):", s):
        return None
    try:
        value, end = _parse(s, 0)
    except (ValueError, IndexError):
        return None
    return value if end == len(s) else None


def _parse(s: str, i: int):
    t = s[i]
    if t == "N":
        return None, i + 2
    if t in "ibd":
        end = s.index(";", i)
        raw = s[i + 2:end]
        return (int(raw) if t == "i" else raw == "1" if t == "b" else float(raw)), end + 1
    if t == "s":
        colon = s.index(":", i + 2)
        n = int(s[i + 2:colon])
        start = colon + 2  # skip :"
        data = s.encode("utf-8")[len(s[:start].encode("utf-8")):]
        text = data[:n].decode("utf-8")
        return text, start + len(text) + 2  # skip ";
    if t == "a":
        colon = s.index(":", i + 2)
        n = int(s[i + 2:colon])
        i = colon + 2  # skip :{
        items = []
        for _ in range(n):
            k, i = _parse(s, i)
            v, i = _parse(s, i)
            items.append((k, v))
        i += 1  # skip }
        keys = [k for k, _ in items]
        if keys == list(range(len(keys))):
            return [v for _, v in items], i
        return {str(k): v for k, v in items}, i
    raise ValueError(f"unknown type {t!r}")
