"""deskmap: describe a desk setup in YAML, validate it, and draw it top-down."""
__version__ = "0.1.0"

from .model import Issue, Setup, from_dict, load  # noqa: E402,F401
from .render import render  # noqa: E402,F401
