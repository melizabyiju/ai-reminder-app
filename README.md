# RemindAI

RemindAI is an AI-powered conversational reminder app that tracks tasks and sends push notifications to your device when they are due. It is designed to run for free on **Cloudflare Pages** and save notifications in a **Cloudflare KV** database.

## Local Setup

1. Open a terminal in this directory (`ai-reminder-app`).
2. Run `npm install` to install dependencies.
3. Run `npm run dev` to start the local developer server.

## Features

- **AI Assistant Chat**: Create reminders using natural language (e.g., *"remind me to write code tomorrow at 2 PM"*).
- **Active Dashboard**: Real-time listing of active and completed reminders with live countdowns.
- **Web Push Notifications**: Sound alarms and receive visual alerts on desktop/mobile even when the browser is closed.
