# hello-cf-node

Hello world app for Cloud Foundry NodeJS buildpack

This app is designed to simulate several common issues that can
occur in a Node.js application, like high CPU usage, high memory
consumption, slow response times, and crashing instances. It's
designed to run as multiple instances, and it tracks the health of
each instance through a shared backing service (currently Redis).

## Development

Node.js v20.0.0 or higher is required, as is a Redis server for now.

To develop locally, run the following commands:

```bash
npm install
npm run dev
```

This will start the app on port 8080 by default. You can change the
port by setting and exporting the `PORT` environment variable:

```bash
export PORT=3000
npm run dev
```
