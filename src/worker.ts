import { EventMessage, EventMessageType } from './types';

import { ClientManager } from './clientManager';
import { WebSocketServer } from 'ws';
import config from './config';
//import bodyParser from 'body-parser';
import { createServer } from 'http';
import express from 'express';
import fs from 'fs';
import path from 'path';
import type net from 'net';
import { setupSwagger } from '../swagger';

// It was used for debugging
//import morgan from 'morgan';

const cfg = config;

const clientManager = new ClientManager();

export async function startWorker() {
    const staticFilesDir = path.resolve(process.cwd(), `public`);

    const app = express();
    //app.use(morgan('tiny'));
    app.use(
        express.json({
            limit: cfg.server.ingestBodyLimit,
        }),
    );

    setupSwagger(app);

    /**
 * @swagger
 * /:
 *   get:
 *     summary: Get index.html with injected WebSocket URL
 *     responses:
 *       200:
 *         description: HTML page with injected WS URL
 *         content:
 *           text/html:
 *             schema:
 *               type: string
 *       404:
 *         description: index.html not found
 */
    app.get('/', (req, res) => {
        const filePath = path.resolve(staticFilesDir, 'index.html');
        let html: string;

        try {
            html = fs.readFileSync(filePath, 'utf-8');
        } catch (er) {
            return res.status(404).send('index.html Not found');
        }

        const host = req.headers.host?.split(':')[0] ?? 'localhost';
        const wsUrl = `ws://${host}:${cfg.server.wsPort}${cfg.server.wsPath}`;
        html = html.replace('{{WS_URL}}', wsUrl);

        return res.status(200).send(html);
    });

    app.use(express.static(staticFilesDir));

    // It could be used for a container health check
    app.get('/health', (_req, res) => res.json({ ok: true }));

    // FluentD posts events here
    app.post(cfg.server.ingestPath, (req, res) => {
        const body = req.body;
        if (!body) {
            return res.status(400).send('empty');
        }

        const events = Array.isArray(body) ? body : [body];
        const validEvents = events.filter(event => event && typeof event === 'object');
        if (process.send) {
            process.send({
                type: EventMessageType.Event,
                payload: validEvents,
            });
        } else {
            clientManager.broadcastEvents(validEvents);
        }

        return res.status(200).send(`ok`);
    });

    // Here we can see list of clients (debug)
    app.get('/clients', (_req, res) => {
        res.json(clientManager.listClients());
    });

    const httpServer = createServer(app);
    httpServer.listen(cfg.server.httpPort, () => {
        console.log(`Worker ${process.pid} HTTP @ ${cfg.server.httpPort} with body limit ${cfg.server.ingestBodyLimit}`);
    });

    let wss: WebSocketServer;

    if (cfg.cluster.enabled) {
        const wsServer = createServer();
        wss = new WebSocketServer({
            server: wsServer,
            path: cfg.server.wsPath,
            perMessageDeflate: false,
        });

        process.on('message', (msg: EventMessage, handle?: net.Socket) => {
            switch (msg.type) {
                case EventMessageType.Event:
                    clientManager.broadcastEvents(msg.payload);
                    break;

                case EventMessageType.StickyConnection:
                    if (handle) {
                        wsServer.emit(`connection`, handle);
                        handle.resume();
                    }
                    break;
            }
        });
    } else {
        wss = new WebSocketServer({
            path: cfg.server.wsPath,
            port: cfg.server.wsPort,
            perMessageDeflate: false,
        });

        console.log(`Worker ${process.pid} WS @ ${cfg.server.wsPort}${cfg.server.wsPath}`);
    }

    wss.on('connection', (ws, req) => {
        cfg.app.logsEnabled && console.log(`Worker ${process.pid} ws connection from ${req.socket.remoteAddress}`);

        try {
            clientManager.addClient(ws);
        } catch (e) {
            cfg.app.logsEnabled && console.error(`Add client error: `, e);

            try {
                ws.close(1011, `internal error`);
            } catch {}

            return;
        }
    });

    wss.on(`close`, (code: any, reason: any) => {
        cfg.app.logsEnabled && console.warn(`Worker ${process.pid} ws close code:${code} reason:${reason?.toString?.() || ''}`);
    });

    wss.on(`error`, err => {
        cfg.app.logsEnabled && console.error(`Worker ${process.pid} ws error: `, err);
    });

    process.on(`uncaughtException`, err => {
        console.error(`Worker ${process.pid} uncaughtException:`, err);
    });

    process.on(`unhandledRejection`, reason => {
        console.error(`Worker ${process.pid} unhandledRejection: `, reason);
    });
}
