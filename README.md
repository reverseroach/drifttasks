# Drift Tasks

**A gentle, ADHD-friendly task manager that works with your Google Calendar.**

Drift Tasks is built for ADHD brains. Instead of piling up overdue tasks and guilt, it helps you brain-dump tasks whenever they come to mind, places a small number of them on each day, and quietly **drifts** anything you didn't get to onto a later day.

> **Status: early development.** The Firestore data layer is mostly in place, but the app UI, scheduling, and Google Calendar sync are not built yet. See [Roadmap](#roadmap) for what's done and what's planned.

## How it's meant to work

- **Brain-dump capture.** Add tasks quickly, with optional priority, energy level, category, and a loose time estimate.
- **A small daily load.** By default you get about 3 tasks a day (adjustable). Scheduling past your limit shows a gentle warning, never a block.
- **Gentle drifting.** Missed tasks automatically move 2 to 5 days out instead of turning red. You can also snooze tasks yourself.
- **Someday list.** Tasks that keep getting pushed back move to a Someday list, which resurfaces once a week.
- **Magic Breakdown.** AI (via the Grok API) splits a big task into small, easy-to-start steps.
- **Weekly review.** A calm Sunday session to look back and plan the week ahead.
- **Streaks.** A day counts if you finish at least one task.
- **Google Calendar aware.** Sign in with Google, and the app reads your calendar events so it can plan around them.

No shame, no rigid deadlines. Just momentum.

## Tech stack

- [Next.js](https://nextjs.org) 16 (App Router) with React 19 and TypeScript
- Tailwind CSS 4 and [shadcn/ui](https://ui.shadcn.com) (Radix)
- Firebase: Firestore and Authentication (Google sign-in)
- `date-fns` for timezone-aware date handling
- [Vitest](https://vitest.dev) for tests
- Planned: Grok API for Magic Breakdown

## Project structure

```
app/          Next.js routes (currently the login page and the starter home page)
components/   shadcn/ui components
hooks/        React hooks (useAuth)
lib/          Firestore service layer: tasks, drift, categories, reviews,
              streaks, insights, userProfile, dateUtils
types/        Shared TypeScript types (Task, TaskSchedule, UserProfile, ...)
proxy.ts      Route protection (Next.js 16 replaces middleware with proxy)
```

A task's placement on a day lives in a separate `taskSchedules` document. When a task drifts, its old schedule is marked `drifted` and a new one is created, which keeps a history of how often a task has moved.

## Getting started

### Prerequisites

- Node.js 20+
- npm

### Install and run

```bash
git clone https://github.com/reverseroach/drifttasks.git
cd drifttasks
npm install
npm run dev
```

Then open http://localhost:3000.

The Firebase web config currently lives in `lib/firebase.ts` and points at the `drift-tasks` Firebase project, so no `.env` file is needed yet. To use your own Firebase project, replace that config and enable Google sign-in under Authentication in the Firebase console.

## Scripts

| Command         | What it does                       |
| --------------- | ---------------------------------- |
| `npm run dev`   | Start the development server       |
| `npm run build` | Build for production               |
| `npm start`     | Run the production build           |
| `npm run lint`  | Run ESLint                         |
| `npm test`      | Run the Vitest test suite          |

## Roadmap

**Done**

- [x] Data model and shared types
- [x] Firestore services for tasks, drift, categories, weekly reviews, user profiles, streaks, and insights
- [x] Timezone-aware date utilities, with tests
- [x] Google sign-in page

**Planned**

- [ ] Today, capture, and weekly review screens
- [ ] Scheduling engine that respects your daily limit and calendar
- [ ] Google Calendar connection (read events, separate access step)
- [ ] Automatic daily drift job
- [ ] Magic Breakdown: AI splits big tasks into steps (Grok API)
- [ ] Recurring tasks (for example, "clean the bathroom every 2 weeks")
- [ ] Gentle guidance, such as suggesting a lower daily limit after several missed days
- [ ] More tests for the `lib/` services and the UI
