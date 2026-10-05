# Weee

**Your home, together.** Weee is a shared home app for couples (and roommates or families). Plans and daily schedules, a follow-up tracker with reminders (great for job applications), a live shopping list, chat and spending, all synced instantly between everyone in the household, with push notifications.

**Live:** https://homelist-tan.vercel.app · install it from the browser with **Add to Home Screen**.

## Features

| | |
|---|---|
| **Plans** | A scrollable row of days. Each day shows plans you have **together** (dates, outings, trips, family) and **each person's own schedule** (work, appointments, errands with start and end times), so you can see each other's day. Undated plans are saved as **Ideas**. Places open in Google Maps. |
| **Shopping list** | Type `2 kg rice, milk, 6 eggs` and it splits into items with quantities, grouped by shop section. Star what's needed today and tick items off at the shop. After a trip, log what it cost. |
| **Tracker** | Things to follow up on, like job applications (Applied → Followed up → Interview → Offer / Rejected) or anything else. Set a reminder date and time, optionally repeating every few days; Weee sends a push notification at that time even when the app is closed. Log each follow-up with a note, snooze, archive. Private by default, or shared with your partner. |
| **Chat** | A private chat for the household with "typing…", "Seen" receipts, unsend, and push notifications for new messages. |
| **Running low** | Every bought item is tracked. Weee starts with a sensible guess (milk ≈ 2 days, rice ≈ 30 days), learns your real rhythm from the gaps between purchases, and shows **"Only a few left"** on the shopping list before you run out. |
| **Money** | Monthly spending by category (groceries, outings, rent, bills, travel…), equal splits, "who owes whom", and settle-up. |
| **Push notifications** | "Priya added Milk", "Priya planned: Dinner at Toit", chat messages and follow-up reminders, even with the app closed (iPhone Home Screen app on iOS 16.4+, and Android). |
| **Feels native** | A matte bento layout and an iOS liquid-glass tab bar (Plans · Map · Discover) (Plans · Tracker · Discover) whose lens stretches between tabs and can be dragged; Discover holds Shopping, Money and Chat. Sliding page transitions, haptic feedback, installable as an app. |
| **Private by design** | Every row belongs to a household, and Postgres row-level security means only its members can read or change it. |

## Tech stack

- **Frontend:** React 19 + Vite, installable PWA with a custom service worker (Workbox)
- **Backend:** Supabase (Postgres, Auth, Realtime, Row Level Security, Edge Functions, Vault)
- **Push:** Web Push (VAPID). Database triggers (new items, plans, messages) and a `pg_cron` job that checks due follow-ups every minute call the `notify` Edge Function through `pg_net`.
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
  screens/       Plans, List, Pantry, Money, Settings, sign-in and onboarding
  components/    UI pieces (buttons, toasts, notification settings)
  lib/           Supabase client, live household data hook, actions, and pure
                 logic (groceries, plans, money) with tests
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
| `households` | name and a unique 6-character invite code |
| `household_members` | who belongs to which household, with display names |
| `items` | shopping list: need/bought, urgent, who added and who bought |
| `pantry` | one row per product: last bought, how long it lasts, recent purchase times |
| `plans` | title, type, date, start/end time, place, notes; `owner` set means that person's own schedule |
| `expenses` | amount, category, payer, who it's split between, settle-ups |
| `push_subscriptions` | which devices get notifications |
| `trackers` | follow-ups: kind, title, details, link, status, next reminder time, repeat, follow-up log; private unless shared |
| `messages` | household chat (latest 300 loaded); `household_members.chat_read_at` powers unread counts and "Seen" |

Households are created and joined through the `create_household` and `join_household` functions. `record_purchase` updates the pantry and learns how long each product lasts. `delete_my_account` removes a user and any household they were the last member of.

## Deploy

```bash
npm run deploy            # runs the tests, then deploys to Vercel production
```

## Roadmap

- Android app with Capacitor (`npx cap add android`) and native haptics and push
- Add follow-up reminders to the phone calendar as a backup alarm
