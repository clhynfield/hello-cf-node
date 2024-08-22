# hello-cf-node

Hello world app for Cloud Foundry NodeJS buildpack

This app is designed to simulate several common issues that can
occur in a Node.js application, like high CPU usage, high memory
consumption, slow response times, and crashing instances. It's
designed to run as multiple instances, and it tracks the health of
each instance through a shared backing service (currently Redis).
