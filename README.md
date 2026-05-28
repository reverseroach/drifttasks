# Drift Tasks

**A gentle, ADHD-friendly task manager that syncs with Google Calendar.**

Drift Tasks is designed for ADHD brains. Instead of punishing you with overwhelming lists and overdue stress, it helps you capture tasks easily, schedules them intelligently, and gracefully handles the days when things don’t get done.

Brain-dump tasks whenever they come to mind. The app automatically schedules them into your Google Calendar and Google Tasks, then **gently drifts** missed tasks to a later day — keeping your mind clear and your calendar clean.

### ✨ Key Features

- **Smart Scheduling** — Considers priority, energy level, task categories, and your existing calendar events
- **Gentle Drifting** — Missed tasks automatically move out of sight instead of creating guilt
- **AI Magic Break Down** — Instantly breaks big tasks into small steps with suggested startup costs
- **Sunday Weekly Review** — A calm, visual session to review and schedule your upcoming week
- **Multiple Categories** — Separate lists like Household, Crafting, Work, Health, etc.
- **Two-way Sync** with Google Calendar & Google Tasks
- **ADHD-First Design** — Big buttons, minimal clutter, dopamine feedback, and forgiving UX

### Philosophy

Built on the belief that productivity tools should work *with* your brain — not against it. No shame. No rigid deadlines. Just momentum and understanding.

### 🛠️ Tech Stack

- **Frontend**: Next.js 15 (App Router) + TypeScript + Tailwind CSS
- **UI Components**: shadcn/ui + Radix
- **Backend/Database**: Firebase (Firestore + Authentication)
- **Integrations**: Google Calendar API + Google Tasks API
- **AI**: Grok API (for Magic Break Down feature)
- **Deployment**: Vercel

---

## 🚀 Installation & Setup
### Prerequisites
- Node.js 20+
- A Google account
- A Firebase project
### 1. Clone the repository
```bash
git clone https://github.com/yourusername/drift-tasks.git
cd drift-tasks
```
### 2. Install dependencies
```bash
npm install
```
### 3. Set up environment variables
Create a `.env.local` file in the root directory and add:
```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_firebase_auth_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_storage_bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

GROK_API_KEY=your_grok_api_key
```
### 4. Google API Setup
- Go to the [Google Cloud Console](https://console.cloud.google.com/welcome/new?pli=1)
- Enable **Google Calendar API** and **Google Tasks API**
- Set up OAuth 2.0 credentials
- Add your authorized redirect URIs
- Enable Google Sign-In in your Firebase Authentication settings
### 5. Run the app
```bash
npm run dev
```
Open http://localhost:3000 to view the application.


------------------------------
This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
