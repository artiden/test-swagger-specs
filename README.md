# fluentd-ws-gateway

`fluentd-ws-gateway` is a Node.js service that bridges [Fluentd](https://www.fluentd.org/) with WebSocket clients, enabling real-time log streaming and filtering.

## Features

- **Real-time log delivery** from Fluentd to connected WebSocket clients.
- **Advanced filtering** by event fields.
- **Manual or automatic pause/resume** of event delivery.
- **Cluster mode support**.

## Architecture

```
Fluentd --> HTTP POST --> fluentd-ws-gateway --> WebSocket Clients
```

- Fluent sends events via HTTP POST (json format) to the gateway.
- The gateway distributes events to the connected WebSocket clients.
- Clients can define filters to receive only relevant events.
- Event delivery can be paused/resumed manually or via a timer.

## Requirements

- Node.js >= 16
- Fluentd configured to send logs via HTTP output plugin

## Installation

```bash
git clone git@github.com:whowgames/fluentd-ws-gateway.git
cd fluentd-ws-gateway
yarn
```

## Local usage (for development)

Start the gateway:

```bash
docker compose up
```

The Fluentd configlocated in the fluentd folder and could be changed for your needs.

### Development without Docker

You can run the service itself without Docker. To do so, use:

```bash
yarn start-dev
```

### Send an example events

If a service is running using Docker (with default fluent configuration), you can run the `sender.sh` script, which'll sends an example event in 2 seconds interval.

### Testing

To run tests, use:

```bash
yarn test
```

### Git actions

Before each `commit` & `push` operation, the Husky runs linter and tests automatically.
