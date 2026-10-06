# Weee
<img width="1600" height="900" alt="weee-1-hero" src="https://github.com/user-attachments/assets/6bf8125c-cbbd-45df-9972-a6e208a4b264" />

<img width="1600" height="900" alt="weee-2-features" src="https://github.com/user-attachments/assets/0004057b-fc57-44b0-8b63-9ad72e4d3211" />



**Your home, together.** Weee is a shared home app for couples (and roommates or families). Plans and daily schedules, love notes, games you play together, a live shopping list, chat and spending, all synced instantly between everyone in the household, with push notifications.

**Live:** https://homelist-tan.vercel.app · install it from the browser with **Add to Home Screen**.

## Features

| | |
|---|---|
| **Plans** | Opens on a card for the two of you: both photos, **days together** (with a glow on anniversaries, every 100 days and every 1,000), what's on today and what's next. Then the love notes, and below them the selected day as one timeline of plans you have **together** (dates, outings, trips, family) and **each person's own schedule** (work, appointments, errands with start and end times). Adding or editing a plan opens a bottom sheet; a calendar button shows the next three months. Undated plans are saved as **Ideas**. Places open in Google Maps. |
| **Profile photos** | Add a photo in Settings. It shows on the Plans card, beside your messages in Chat and on the "thinking of you" heart. Photos are cropped to a square, stored in a private bucket and only visible to people in your household. |
| **Shopping list** | Type `2 kg rice, milk, 6 eggs` and it splits into items with quantities, grouped by shop section. Star what's needed today and tick items off at the shop. After a trip, log what it cost. |
| **Countdowns** | Big-number tiles on Discover ("12 days · Goa trip"). Anniversaries and birthdays repeat every year and show which one it is ("3rd"); on the day the tile glows and both phones get a 9 am notification. |
| **Love notes** | One tap on the home screen sends 💗 Thinking of you, ❤️ I love you, 🥺 I miss you or 📍 Where are you? (the heart is also in the chat box). Your partner gets a notification with a heartbeat vibration, or a full-screen moment if Weee is open, with "Love you too" / "Miss you too". "Where are you?" offers quick answers (On my way, At home, At work…) or a one-off map link of where they are right now, sent into the chat. Tap **+** to add your own notes (a nickname, "Good night 🌙", up to 8 each, only visible to the two of you), and each button shows how many times you've sent it. Tap **Edit** (or hold a note) to remove notes: your own are deleted, built-in ones are hidden and can be brought back. |
| **Games** | Eight games, played live. To win: **Tic Tac Toe**, **Four in a Row** (falling discs), **Memory Match** (love-themed cards, a pair means you go again) and **Rock Paper Scissors** (first to ten; picks stay hidden until you have both picked). Just for the two of you: **This or That**, **Who's More Likely To** (both secretly point at one of you), **How Well Do You Know Me** (one answers about themselves, the other guesses) and **Truth or Dare** (sweet and silly prompts). A row of tease emojis (😂 😭 😜 …) pops up big on the other phone. Scoreboard, presence, "your move" badges, push notifications for your turn (skipped while you are already looking), confetti and rematches. Clear finished games from your own Recent list without touching your partner's. |
| **Chat** | A private chat with "typing…", sent/delivered/seen ticks, double-tap ❤️ and emoji reactions, swipe-to-reply with quotes, pinned messages, tappable links (map links show as "Open in Maps"), delete for me / unsend / clear chat, and push notifications. |
| **Running low** | Every bought item is tracked. Weee starts with a sensible guess (milk ≈ 2 days, rice ≈ 30 days), learns your real rhythm from the gaps between purchases, and shows **"Only a few left"** on the shopping list before you run out. |
| **Money** | Monthly spending by category (groceries, outings, rent, bills, travel…), equal splits, "who owes whom", and settle-up. |
| **Push notifications** | "Priya added Milk", "Priya planned: Dinner at Toit", chat messages, love notes and "your move" in games, even with the app closed (iPhone Home Screen app on iOS 16.4+, and Android). |
| **Feels native** | An animated start screen (the glass lens forms, its rainbow rim draws in, then the W), a matte bento layout and an iOS liquid-glass tab bar (Plans · Games · Discover) whose lens stretches between tabs and can be dragged; Discover holds Shopping, Money and Chat. Sliding page transitions, haptic feedback, installable as an app. |
| **Private by design** | Every row belongs to a household, and Postgres row-level security means only its members can read or change it. |

## Tech stack

- **Frontend:** React 19 + Vite, installable PWA with a custom service worker (Workbox)
- **Backend:** Supabase (Postgres, Auth, Realtime, Row Level Security, Edge Functions, Vault)
- **Push:** Web Push (VAPID). Database triggers (new items, plans, messages, love notes, game moves) and a daily `pg_cron` job for countdowns call the `notify` Edge Function through `pg_net`.
- **Hosting:** Vercel
- **Tests:** Vitest for the core logic: list parsing, stock levels, splits, spending and plan dates. Runs on every push with GitHub Actions.

```
Phone A ──insert──▶ Postgres (RLS) ──realtime──▶ Phone B (updates live)
                         │
                         └─trigger─▶ Edge Function "notify" ──Web Push──▶ Phone B (app closed)
```

## Project structure

```
src/
  screens/       Plans, Games, Discover, Shopping, Money, Chat, Settings, sign-in
  components/    UI pieces (love notes, countdowns, the games, tab bar, sheets)
  lib/           Supabase client, live household data hook, actions, and pure
                 logic (groceries, plans, money, love notes, game rules) with tests
  sw.js          Service worker: offline app shell + push notifications
supabase/
  migrations/    Database schema, RLS policies, functions, triggers
  functions/notify/   Edge Function that sends push notifications
  config.toml    Auth settings (pushed with the Supabase CLI)
```

## Run it locally

```bash
npm install
cp .env.example .env      # fill in your Supabase URL, publishable key and VAPID public key
npm run dev               # http://localhost:3000
npm run dev:phone         # same, reachable from phones on your Wi-Fi
npm test
npm run build
```

## Set up your own backend

```bash
npx supabase login                       # in a normal terminal window
npx supabase link --project-ref <ref>
npx supabase db push                     # creates all tables, policies and functions
npx supabase config push                 # auth settings from supabase/config.toml
npx web-push generate-vapid-keys         # keys for push notifications
npx supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... PUSH_WEBHOOK_SECRET=... VAPID_SUBJECT=https://your-site
npx supabase functions deploy notify --no-verify-jwt --use-api
```

Then store the function URL and webhook secret in Supabase Vault as `notify_function_url` and `push_webhook_secret`, so the database triggers can call the function.

## Database

| Table | What it holds |
|---|---|
| `households` | name, a unique 6-character invite code and the date you got together |
| `household_members` | who belongs to which household, with display names, profile photo path, hidden love notes and which game is open |
| `items` | shopping list: need/bought, urgent, who added and who bought |
| `pantry` | one row per product: last bought, how long it lasts, recent purchase times |
| `plans` | title, type, date, start/end time, place, notes; `owner` set means that person's own schedule |
| `expenses` | amount, category, payer, who it's split between, settle-ups |
| `push_subscriptions` | which devices get notifications |
| `countdowns` | title, date, repeats yearly |
| `nudges` | love notes: `kind` is heart, love, miss, where or custom (kept 30 days, one every 3 seconds); a custom note's words are copied from the sender's saved note by the database |
| `love_notes` | each person's own notes: emoji and text, up to 8 each |
| `note_counts` | how many times each person has sent each note, kept up to date by a trigger |
| `message_reactions` | one emoji reaction per person per message |
| `games` | one row per game: kind, the two players, whose turn, the board or rounds as JSON, status, winner, and who has cleared it from their Recent list; only the player whose turn it is can change a board |
| `game_picks` | hidden picks for Rock Paper Scissors and This or That; each person sees only their own, and a trigger reveals the round once both have picked |
| `messages` | household chat (latest 300 loaded); `household_members.chat_read_at` powers unread counts and "Seen" |

Profile photos live in the private `avatars` storage bucket, one folder per person; you can only upload into your own folder and only household members can get a link to view them.

Households are created and joined through the `create_household` and `join_household` functions. `record_purchase` updates the pantry and learns how long each product lasts. `delete_my_account` removes a user and any household they were the last member of.

## Deploy

```bash
npm run deploy            # runs the tests, then deploys to Vercel production
```

## Roadmap

- Android app with Capacitor (`npx cap add android`) and native haptics and push
- More games (Dots and Boxes, a daily couples question)
