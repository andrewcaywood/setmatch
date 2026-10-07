# SetMatch

AI-assisted casting for student film.

[Live demo](https://setmatch-forgehacks-2026.andrewlcaywood.chatgpt.site/)

## Overview

SetMatch helps student filmmakers discover actors whose stated interests, experience, and availability fit a role. Filmmakers create a role brief, review ranked actor profiles, and send invitations. Actors can read the full project brief before deciding whether to accept.

The goal is to make the first stage of creative collaboration more discoverable, transparent, and intentional.

## Features

- Editable film briefs with role, tone, genres, skills, and shoot availability
- AI-assisted semantic matching between role descriptions and actor profiles
- Match reasons that show shared genres, skills, and availability
- Swipe-based profile review and invitation flow
- Separate filmmaker and actor views
- Browser-local saved demo state
- Local fallback matching when the semantic model is unavailable

## How matching works

SetMatch uses a quantized pretrained `all-MiniLM-L6-v2` sentence-embedding model through Transformers.js. The model runs in the browser and converts role briefs and actor profiles into embeddings, which are compared using cosine similarity.

The match score combines:

- 70% semantic similarity
- 15% shared genre interests
- 15% shared skills

Availability is treated as a filter. Match scores are a sorting aid, not a prediction of acting ability or a substitute for human judgment.

If the pretrained model cannot load, SetMatch uses browser-local TF-IDF text matching so the prototype remains usable.

## Built with

- HTML
- CSS
- JavaScript
- Transformers.js
- Hugging Face `all-MiniLM-L6-v2`
- ONNX
- Browser localStorage

## Run locally

Clone the repository, then serve the `dist` directory:

```bash
python -m http.server 4173 --directory dist
```

Open `http://localhost:4173` in a browser.

The first semantic-model load requires an internet connection. Later visits may use the browser cache.

## Privacy and limitations

This prototype uses fictional actor profiles and does not collect real student data. It does not analyze audition videos, appearance, age, or protected characteristics.

Semantic similarity may overvalue a well-written profile or miss qualities that are difficult to express in text. SetMatch is designed to support conversation and discovery, not replace casting judgment.

## Hackathon

Built for ForgeHacks 2026, AI + Creativity.
