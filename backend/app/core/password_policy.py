import re

PASSWORD_REQUIREMENT_TEXT = "8-72 characters, one letter, one number, one special character, and no spaces"


def validate_password_strength(password: str) -> str:
    if len(password) < 8 or len(password) > 72:
        raise ValueError(f"Password must be {PASSWORD_REQUIREMENT_TEXT}.")
    if re.search(r"\s", password):
        raise ValueError(f"Password must be {PASSWORD_REQUIREMENT_TEXT}.")
    if not re.search(r"[A-Za-z]", password):
        raise ValueError("Password must include at least one letter.")
    if not re.search(r"\d", password):
        raise ValueError("Password must include at least one number.")
    if not re.search(r"[^A-Za-z0-9\s]", password):
        raise ValueError("Password must include at least one special character.")
    return password
