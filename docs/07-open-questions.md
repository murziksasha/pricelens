# 07 — Open Questions
- Proxy support needed later (FR-SCH-006)? The request layer has a hook and no provider.
- Default cost values (delivery, repair) for expected profit (FR-CMP-006). Settings default both to 0; minimum margin defaults to 1 500 UAH.
- Automatic LAN discovery is not implemented. The desktop and web clients store the server URL and can probe `/health`.
- Email notifications from FR-NTF-001 are not implemented. In-app and Telegram are.
- Live contract tests for the 16 sites (`RUN_LIVE=1`) have not been recorded yet. Offline snapshots pass. See `docs/site-status.md`.
