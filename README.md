# Imera

A calendar, reminder, and notes app. Local-first, cross-platform, no ads.

The name comes from the Greek for "day". Pronounced ee-MEH-ra.

## What it is

Most calendars store times. Imera stores the context around them — the notes,
the person you need to call, the address, the thing you wrote down last week
that turned into an appointment.

The core interaction that defines the product: you write a note, and the note
becomes a scheduled thing. Everything else supports that.

## What it is not

- Not an AI assistant. No chat, no "smart" scheduling, no generated summaries.
- Not ad-supported. Ever.
- Not a team productivity suite.
- Not a replacement for Google or Apple Calendar. It exports to them freely.

## V1 scope

V1 is local-first. No accounts, no backend, no sync, no sharing, no payments.
Everything lives on the device. This is deliberate — it ships faster, costs
nothing to run, and validates the product before infrastructure exists.

### Events
- Title, date, time, duration, all-day toggle
- Rich description with real formatting — bold, italic, underline, bullet and
  numbered lists — plus free-form notes attached to the event
- Phone numbers as first-class fields, with tap-to-call and tap-to-text
- Location as text plus a maps link
- Recurrence: daily, weekly, monthly, yearly, and weekday patterns
- Per-occurrence exceptions, without touching the series: skip a single
  occurrence, or move one — gym at 18:00 becomes 19:00 just this once, or
  shifts to another day. Skipped and moved occurrences are listed on the
  event and can be restored.

### Reminders
- Any event can have one or more reminders
- Lead time is user-configurable per reminder, not a fixed preset list
- Standalone reminders that are not tied to an event
- Delivered as local notifications; no push infrastructure

### Notes
- Free-form notes, unattached
- Notes attached to a specific date
- Convert any note, or a selected line within a note, into an event or a
  reminder. The link between them persists and is visible from both sides.

### Calendar interop
- Write events to the device calendar via expo-calendar, which propagates to
  whatever accounts the user has synced (Google, Apple, Exchange)
- Export any calendar or selection as a .ics file
- One-time .ics import
- Export is never gated, at any tier, forever. This is a product principle,
  not a feature decision.

### Views
- Month, week, day, and agenda
- Light and dark themes, following system by default with a manual override

## V2 scope — do not build in V1

- Accounts and cross-device sync
- In-app sharing of calendars, schedules, and notes
- Permission levels (view vs edit), per-person visibility, comments on events
- Live calendar subscription by URL (as opposed to one-time .ics import)
- Home-screen and lock-screen widgets for notes, reminders, and calendar
- Web app (React)
- In-app purchases and tiering
- Organization tier with roles and admin control
- Optional setting to rotate the app icon by month (opt-in only; iOS shows a
  system alert on every icon change, so this must never be automatic)

### V2 pricing, for context only

| | Free | Plus | Organization |
|---|---|---|---|
| Price | — | $17.99/yr, $3.99/mo, or $49 lifetime | $4/user/mo, 3-seat minimum |
| Sharing | 2 people | 10 people | Unlimited |
| Permissions | View/edit only | Roles, per-person visibility | Admin control, delegated access |
| Export | Full | Full | Full |

Regional price tiers on both stores. The paid value is deliberately the
collaborative layer — anything a user could reproduce by exporting to Google
Calendar stays free.

## Stack

- Expo (React Native), TypeScript, mobile-first
- Local persistence: expo-sqlite
- Notifications: expo-notifications (local only)
- Calendar interop: expo-calendar
- Dates: date-fns, with explicit timezone handling — never naive Date math
- Navigation: expo-router
- State: keep it boring. Zustand or React context. No Redux.
- No backend in V1. If you find yourself adding a network call, stop and ask.

Web (React) is V2. Share the date logic, recurrence rules, and data model as
platform-agnostic TypeScript modules from the start so the web build can
consume them later. Do not attempt to share UI components.

## Visual identity

### Palette

| Role | Light | Dark |
|---|---|---|
| Accent | `#2E6B57` patina | `#C08A4A` bronze |
| Surface | `#EDEAE0` warm paper | `#22201D` ink |

Never pure white and never pure black. The warm off-white is load-bearing —
it is what makes the notes side of the app feel like paper.

One accent color. Do not introduce a secondary accent, a gradient, or a
semantic color ramp beyond what is needed for destructive actions.

### The mark

A twelve-segment ring with an index marker at the top and a pointer from the
center. It derives from the Antikythera mechanism's calendar dial — an
instrument you read, not a gear that turns.

The pointer angle is a variable, not a fixed drawing. `monthIndex * 30`
degrees, or `(monthIndex + dayOfMonth / daysInMonth) * 30` for date precision.

- Static brand lockup: pointer fixed at 45 degrees
- Launch animation: pointer sweeps once and settles on the current month
- Loading state: pointer steps between the twelve positions. Use a stepped
  easing, never linear. A smooth spin is a generic spinner; a stepping one
  reads as an instrument.

The twelve divisions must stay countable. Do not thin the stroke or add ticks
until they blur into texture — at that point it stops being a calendar.

### Typography and tone

- Interface: system sans
- Note body text: a serif, because notes are meant to be read
- Sentence case everywhere. No title case, no all caps.
- Copy is written in first person by a person. "I built this because..." is
  the right register for the App Store description and the about screen.

### Restraint

Keep the archaeology in the icon and the origin story. The app's screens are
plain and modern. No gears, no bronze textures, no ancient-Greek motifs in
the UI. The green is a quiet accent, not a theme.

## Icon generation

Source SVGs live in `assets/brand/`. Generate raster sizes with a script at
`scripts/generate-icons.ts` using sharp:

- `icon-1024.png` — iOS App Store, full-bleed square, no rounded corners
  (iOS applies its own mask)
- `adaptive-icon-foreground.png` — 432x432, Android adaptive. The mark must
  shrink to roughly 55% of canvas width to survive Android's circular mask.
- `adaptive-icon-background.png` — 432x432, flat surface color
- `favicon.png` — 32 and 16
- `pwa-192.png`, `pwa-512.png`
- `notification-icon.png` — 96x96, white silhouette on transparent, Android
  requires monochrome

Wire `icon`, `adaptiveIcon`, and `splash` in `app.json` to the generated files.

Create the brand assets for Imera.

Geometry (all icons use viewBox "0 0 512 512", fill="none"):
- index marker: <polygon points="256,95 230,51 282,51"/>
- ring: <circle cx="256" cy="256" r="161" stroke-width="29"/>
  - 12-segment (default): stroke-dasharray="55 29.3"
  - 6-segment (small sizes, 24px and below): stroke-dasharray="110 58.6"
- pointer: <g transform="rotate(45 256 256)"><line x1="256" y1="256" x2="256"
  y2="139" stroke-width="22" stroke-linecap="round"/></g>
- hub: <circle cx="256" cy="256" r="29"/>

Colors:
- light: mark #2E6B57 on surface #EDEAE0
- dark:  mark #C08A4A on surface #22201D

Write these files to assets/brand/:
1. imera-mark.svg          — mark only, transparent, all strokes/fills use
                             currentColor. For in-app use.
2. icon-light.svg          — full-bleed <rect width="512" height="512"> in
                             #EDEAE0, 12-segment. NO rounded corners.
3. icon-dark.svg           — same, #22201D surface, #C08A4A mark.
4. icon-small-light.svg    — 6-segment variant, light.
5. icon-small-dark.svg     — 6-segment variant, dark.
6. icon-adaptive-fg.svg    — mark only on transparent, scaled to 55% of the
                             canvas so it survives Android's circular mask.
7. notification-icon.svg   — mark only, solid white, transparent background.

Then write scripts/generate-icons.ts using sharp to rasterize:
- icon-1024.png            from icon-light.svg   (1024, iOS App Store)
- adaptive-icon-fg.png     from icon-adaptive-fg.svg (432)
- adaptive-icon-bg.png     flat #EDEAE0 (432)
- pwa-512.png, pwa-192.png from icon-light.svg
- favicon-32.png           from icon-small-light.svg
- favicon-16.png           from icon-small-light.svg
- notification-icon.png    from notification-icon.svg (96)

Add an "icons" npm script that runs it, and wire icon, adaptiveIcon, and
splash in app.json to the generated files.