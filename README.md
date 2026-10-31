# Deutschy 🥨🎾

A small, personal German-learning web app: small talk, uni life, tennis and everyday German,
plus an evening summary with your boyfriend and photos of the two of you as rewards.

## What's inside

| Tab | What it does |
|---|---|
| 🏠 **Heute** | Daily goal (XP), today's plan, word of the day, grammar tip of the day, level & streak |
| 📚 **Lernen** | 7 topics (Small Talk, Alltag, Uni, Tennis, Freizeit, Mein Tag, Wir zwei), ~220 words & phrases with spaced repetition. Exercises: new-word cards, multiple choice, listening, typing (with ä ö ü ß keys), sentence building |
| 💬 **Gespräche** | 7 role-play dialogues (after tennis practice, Mensa, lecture hall, café, weekend plans, after the exam, "Wie war dein Tag?"). Read mode, then role-play mode where she says her lines out loud first |
| 🌙 **Abend** | Daily summary: today's stats and new words → she writes about her day in German (mood + sentence starters) → **evening talk**: he asks 5 questions of the day in German, ticks the ones she answers, writes feedback/corrections → "Geschafft!" → photo reward. Plus a "photo of the day" and a diary of past days |
| 📸 **Album** | Unlocked reward photos (polaroids) and the photos of the day |

Rewards: reaching the **daily goal** unlocks a photo, and finishing the **evening talk** unlocks another.
Pronunciation uses the phone's built-in German voice (Web Speech API).

## Run it

It's plain HTML/CSS/JS, so there's no build step.

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

**Put it on her phone:** turn on GitHub Pages (Settings → Pages → deploy from branch `main`, folder `/`),
open the URL on her phone and choose **"Add to Home Screen"**. It then behaves like an app and works offline.

## Personalise

- `js/config.js`: her name, your name, daily goal, reward photos.
- `js/content.js`: all vocabulary, dialogues, tips, evening questions. Add new words as `[German, English, example, example translation]`.

### Adding the photos of you two

There are two ways:

1. **Private (recommended if the repo/site is public):** on her phone, open ⚙️ → *Belohnungsfotos* → *Fotos hinzufügen*.
   The photos are stored only on that device and stay hidden (🙈) until she unlocks them.
2. **In the repo:** put the files in `images/` and list them in `js/config.js`:
   ```js
   photos: [
     { src: "images/01.jpg", caption: "Unser erstes Date ☕" },
   ],
   ```
   Anyone who can open the website can see these files.

Progress is saved in the browser (localStorage + IndexedDB). Use ⚙️ → *Backup* to export or import it.
