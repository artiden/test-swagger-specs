import { CompiledFilter, compileRules, evalRules } from './filter';
import { EventPayload, FilterMode, FilterRule } from './types';

import { v4 as uuidv4 } from 'uuid';
import WebSocket from 'ws';
import config from './config';

const cfg = config;

type ClientRec = {
    id: string;
    ws: WebSocket;
    compiled: CompiledFilter[];
    rules: FilterRule[];
    mode: FilterMode;
    paused: boolean;
    lastActivity: number;
    inactivityTimeoutMs: number;
    inactivityTimer?: NodeJS.Timeout;
};

export class ClientManager {
    private clients = new Map<string, ClientRec>();
    private maxBuffered = config.maxBufferedAmount;

    /** Attach a new client. Starts in paused state intentionally. */
    addClient(
        ws: WebSocket,
        opts?: {
            id?: string;
            rules?: FilterRule[];
            mode?: FilterMode;
            inactivityTimeoutMs?: number;
        },
    ) {
        const defaultRules = cfg.client.defaultFilters.map((f: string): FilterRule => ({ expr: f }));
        const id = opts?.id ?? uuidv4();
        const rules = opts?.rules ?? defaultRules;
        const compiled = compileRules(rules);
        const mode = opts?.mode ?? 'AND';
        const timeout = opts?.inactivityTimeoutMs ?? config.pauseOnInactivityMs;

        const rec: ClientRec = {
            id,
            ws,
            compiled,
            rules,
            mode,
            paused: true, // start paused so user can set filters first
            lastActivity: Date.now(),
            inactivityTimeoutMs: timeout,
        };

        this.clients.set(id, rec);

        ws.on('message', raw => {
            this.onMessage(id, raw.toString());
            this.bumpActivity(id);
        });

        ws.on(`close`, (code: any, reason: any) => {
            cfg.app.logsEnabled &&
                console.warn(`Worker ${process.pid} ws client ${id} close code:${code} reason:${reason?.toString?.() || ''}`);
            this.removeClient(id);
        });

        ws.on(`error`, err => {
            cfg.app.logsEnabled && console.error(`Worker ${process.pid} ws client ${id} error: `, err);
            this.removeClient(id);
        });

        this.resetInactivityTimer(id);

        this.safeSend(
            ws,
            JSON.stringify({
                type: 'welcome',
                id,
                paused: rec.paused,
                filters: rec.rules,
                mode: rec.mode,
            }),
        );

        return id;
    }

    removeClient(id: string) {
        this.withClient(id, `removeClient`, client => {
            if (client.inactivityTimer) {
                clearTimeout(client.inactivityTimer);
            }

            try {
                if (client.ws.readyState === WebSocket.OPEN) {
                    client.ws.close(1000, `client removed`);
                }
            } catch {}

            this.clients.delete(client.id);
        });
    }

    listClients() {
        return Array.from(this.clients.values()).map(c => ({
            id: c.id,
            paused: c.paused,
            mode: c.mode,
            inactivityTimeoutMs: c.inactivityTimeoutMs,
        }));
    }

    withClient<T>(id: string, caller: string, fn: (client: ClientRec) => T): T | undefined {
        const client = this.clients.get(id);
        if (!client) {
            cfg.app.logsEnabled && console.warn(`[ClientManager] ${caller}: no client for id=${id}`);
            return;
        }
        return fn(client);
    }
    private onMessage(id: string, raw: string) {
        try {
            let data: any;
            try {
                data = JSON.parse(raw);
            } catch {
                cfg.app.logsEnabled && console.error(`Worker ${process.pid} client: ${id} bad json: ${raw}`);
                return;
            }

            if (!data || typeof data.type !== 'string') {
                return;
            }

            switch (data.type) {
                case 'pause':
                    this.setPaused(id, true, data.reason || 'manual');
                    break;
                case 'resume':
                    this.setPaused(id, false, data.reason || 'manual');
                    break;
                case 'setFilters':
                    if (Array.isArray(data.filters)) {
                        this.updateFilters(id, data.filters);
                    }
                    break;
                case 'setMode':
                    if (data.mode === 'AND' || data.mode === 'OR') {
                        this.updateMode(id, data.mode);
                    }
                    break;
                case 'setInactivity':
                    if (typeof data.inactivityTimeoutMs === 'number') {
                        this.updateInactivity(id, data.inactivityTimeoutMs);
                    }
                    break;
                default:
                    cfg.app.logsEnabled && console.error(`Worker ${process.pid} invalid client message type: ${data.type}`);
                    break;
            }
        } catch (e) {
            cfg.app.logsEnabled && console.error(`Worker ${process.pid} ws message handler error:`, e);
        }
    }

    private updateFilters(id: string, rules: FilterRule[]) {
        this.withClient(id, `updateFilters`, client => {
            client.rules = rules;
            client.compiled = compileRules(rules);
            client.lastActivity = Date.now();
            this.resetInactivityTimer(client.id);
            this.safeSend(client.ws, JSON.stringify({ type: 'filtersSet', ok: true, count: client.rules.length }));
        });
    }

    private updateMode(id: string, mode: FilterMode) {
        this.withClient(id, `updateMode`, client => {
            client.mode = mode;
            client.lastActivity = Date.now();
            this.resetInactivityTimer(client.id);
            this.safeSend(client.ws, JSON.stringify({ type: 'modeSet', mode }));
        });
    }

    private updateInactivity(id: string, ms: number) {
        this.withClient(id, `updateInactivity`, client => {
            client.inactivityTimeoutMs = ms;
            this.resetInactivityTimer(client.id);
            this.safeSend(client.ws, JSON.stringify({ type: 'inactivitySet', ms }));
        });
    }

    private setPaused(id: string, paused: boolean, reason: 'manual' | 'inactivity' | 'activity') {
        this.withClient(id, `setPaused`, client => {
            client.paused = paused;
            client.lastActivity = Date.now();
            this.resetInactivityTimer(client.id);
            this.safeSend(client.ws, JSON.stringify({ type: paused ? 'paused' : 'resumed', reason }));
        });
    }

    private bumpActivity(id: string) {
        this.withClient(id, `bumpActivity`, client => {
            client.lastActivity = Date.now();
            if (client.paused) {
                // Do not auto-resume on activity; user should press Start explicitly
                return;
            }
            this.resetInactivityTimer(client.id);
        });
    }

    private resetInactivityTimer(id: string) {
        this.withClient(id, `resetInactivityTimer`, client => {
            if (client.inactivityTimer) {
                clearTimeout(client.inactivityTimer);
            }

            client.inactivityTimer = setTimeout(() => {
                this.setPaused(id, true, 'inactivity');
            }, client.inactivityTimeoutMs);
        });
    }

    broadcastEvents(events: EventPayload[]) {
        events.forEach(event => this.broadcastEvent(event));
    }

    broadcastEvent(event: EventPayload) {
        let msg: string;
        try {
            msg = JSON.stringify({
                type: 'event',
                payload: event,
                ts: Date.now(),
            });
        } catch (er) {
            cfg.app.logsEnabled && console.error(`Broadcast event: cannot stringify payload`, er);
            return;
        }

        // We don't need id
        for (const [, r] of this.clients) {
            if (r.paused) {
                continue;
            }

            // Checking an event for user's filters
            let passFilter = false;
            try {
                passFilter = evalRules(r.compiled, event, r.mode);
            } catch (er) {
                cfg.app.logsEnabled && console.warn(`evalRules failed`, er);
                continue;
            }

            if (!passFilter) {
                continue;
            }

            if (r.ws.readyState !== WebSocket.OPEN) {
                cfg.app.logsEnabled && console.warn(`Broadcast event: invalid WebSocket state: ${r.ws.readyState}`);
                continue;
            }

            if (r.ws.bufferedAmount > this.maxBuffered) {
                // Drop message for slow client to avoid memory growth.
                cfg.app.logsEnabled && console.warn(`client ${r.id} buffered=${r.ws.bufferedAmount}, dropping`);
                continue;
            }

            try {
                r.ws.send(msg);
            } catch (er) {
                cfg.app.logsEnabled && console.warn(`Broadcast event: message send fail. Removing client`, er);
                this.removeClient(r.id);
            }
        }
    }

    private safeSend(ws: WebSocket, msg: string) {
        try {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(msg);
            }
        } catch {}
    }
}
