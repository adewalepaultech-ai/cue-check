# Cue Check

Cue Check is a React + Vite application for recording media-team service readiness checks.

## Features
- Email sign-in through the AppDeploy authentication client
- Create and manage service checklists
- Track checklist completion and notes
- Review service check history
- Export service reports as PDF, including checker details
- Light and dark appearance modes

## Run locally
```bash
npm install
npm run dev
```

Build for production with `npm run build`.

## Data storage
The current app stores checklist records and appearance preferences in browser local storage. Data is browser/device-local; this version does not implement shared cloud database synchronization.

## Deployment
The app was originally deployed with AppDeploy. The authentication integration imports `@appdeploy/client`; running outside AppDeploy may require the corresponding runtime and configuration.

## Source
Exported from AppDeploy app `cue-check-7ceooe`, source snapshot version `1795464972271`.
