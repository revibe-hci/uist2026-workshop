"""Vercel entry point: every /api/ request goes to TaleBrush Studio's handler.
On Vercel there is no LLM bridge, so server.py asks each visitor for their own key."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from server import Handler as handler  # noqa: E402,F401  (Vercel looks for `handler`)
