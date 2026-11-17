# KnightScope V6

V6 is a separate copy of the V5 extension foundation. The original V5 folder and ZIP are unchanged.

## Included
- Existing V5 game-review and compact panel files/assets
- Existing Best Move / analysis tools and customisation
- Existing local Chess & design assistant
- Manifest version 6.0.0

## V6 AI features status
The planned Chatbot and password-gated Developer AI with OpenAI API access are **not yet connected** in this initial V6 package. No API key is embedded in this repository. A secure backend must be deployed and configured before those AI modes can work. Developer changes should always be previewed as a diff and explicitly applied, with undo/restore.

The Developer AI password is intended as a convenience lock only; a password embedded in a browser extension cannot provide strong security. Do not put API secrets in extension source.

## Install
1. Download and extract `KnightScope-v6.zip`.
2. In Chrome, open `chrome://extensions`.
3. Enable Developer mode.
4. Choose **Load unpacked** and select the extracted `KnightScope-v6` folder.

This package has not been runtime-tested in Chrome yet.
