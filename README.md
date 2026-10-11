# Climbing Training Tracker

A mobile-first, local-first PWA for tracking climbing training:

- **Daily readiness check-in** — Green / Yellow / Orange / Red / Black, graded to a points score.
- **Calendar** of past & future days; **schedule** workouts by weekday or specific date.
- **Workouts** grouped by category — _on-wall drills_, _off-the-wall strength & conditioning_, _core_, _mobility_ — with complete / partial / skipped marks.
- **Time-based exercises** (e.g. "max reps in 10 s", timed holds) alongside classic reps/sets.
- **Reference media** (image/video URL) per exercise to confirm form.
- **Trend charts** per exercise and a readiness-over-time view.
- **Import from Notes** — paste your coach's note and an LLM structures it into a workout (optional; choose **Claude (Anthropic)** or **ChatGPT (OpenAI)** and use your own API key).

Everything is stored on-device (localStorage) first. **Cloud sync** via Supabase is optional (see below); without it, use **Settings → Export JSON** to back up or move data between devices.

## Develop

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build
npm run preview  # serve the production build
```

Install to your phone's home screen via the browser's "Add to Home Screen" (it's a PWA).

## AI note parsing

In **Settings → AI note parsing**, pick a provider — **Claude (Anthropic)** or **ChatGPT (OpenAI)** — enter that provider's API key, and choose a model. Keys are stored only in your browser; calls go directly from your device to the chosen provider. Then **Exercises → Import**. Works fully without a key via manual entry.

### Sample coach note (for testing the parser)

```
Tuesday session — power

Warm up: 5 min easy traverse, then wrist + shoulder mobility flow 3 min.

On the wall:
- 4x4 boulders at V3, full rest between sets
- Silent feet drill, 3 routes

Strength:
- Max hangs on 20mm edge: 5 x 10s, full crimp
- Weighted pull-ups 4 x 5 @ +15kg
- Campus ladders 3 sets

Core:
- Front lever progression 4 x 12s hold
- Hanging leg raises 3 x 10

Finish with 10 min stretching.
```

Expected parse: a "Tuesday session — power" template with exercises classified into
on-wall drills (4x4s, silent feet), strength & conditioning (max hangs → `hold`
5×10s, weighted pull-ups → `reps` 4×5, campus ladders), core (front lever →
`hold` 4×12s, leg raises → `reps` 3×10), and mobility (traverse warm-up, mobility
flow, stretching → `duration`).

## Cloud sync (Supabase) — optional

Syncs check-ins, exercises, workouts, templates and the schedule across devices. Offline-first: the app always works from local data and syncs in the background (after edits, on startup, when the app regains focus or comes back online). Conflicts resolve last-write-wins per record. **AI API keys are never uploaded.**

One-time setup:

1. Create a project at [supabase.com](https://supabase.com) (free tier is fine).
2. **SQL Editor → New query**, paste the contents of [`supabase/schema.sql`](supabase/schema.sql), **Run**. This creates the `records` table with row-level security (each user can only see their own rows).
3. **Authentication → Sign In / Providers → Email**: turn **Confirm email** off. This lets you sign in with an email + password immediately, with no email sent.
4. **Project Settings → API**: copy the project URL and the `anon` public key into `.env.local` (see `.env.example`):
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=...
   ```
5. Restart `npm run dev`, open **Settings → Cloud sync**, enter your email and a password, and tap **Create account**. On your other devices, **Sign in** with the same email and password.
6. Optional but recommended: once your account exists, turn off **Allow new users to sign up** (same Email settings page) so nobody else can create accounts on your project.

Prefer a passwordless **Email code**? It needs the Magic Link email template to include `{{ .Token }}` (Authentication → Email Templates). Supabase may restrict template editing unless custom SMTP is configured; if so, use the password option instead. The built-in email sender also has a very low hourly limit.

For a deployed build, set the same two `VITE_` variables in your host's environment.
