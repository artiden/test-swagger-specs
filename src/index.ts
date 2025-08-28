import * as cluster from 'cluster';

import { EventMessage, EventMessageType } from './types';

import { startWorker } from './worker';
import config from './config';
import crypto from 'crypto';
import net from 'net';
import os from 'os';

const cfg = config;

// For clustered servers selection
let workerIds: string[] = [];
const rebuildWorkerIds = () => {
    workerIds = Object.keys(cluster.default.workers ?? {})
        .filter(id => {
            const w = cluster.default.workers?.[id];

            return !!w && w.isConnected();
        })
        .sort((a, b) => Number(a) - Number(b));
};

const hashToU32 = (key: string): number => {
    const buffer = crypto.createHash('sha1').update(key).digest();

    return buffer.readUInt32BE(0);
};

const getClientKey = (socket: net.Socket): string => {
    return (socket.remoteAddress ?? '0.0.0.0').replace('::ffff:', '');
};

const pickWorkerByKey = (key: string): cluster.Worker | undefined => {
    const workerCount = workerIds.length;
    if (!workerCount) {
        return undefined;
    }

    const index = hashToU32(key) % workerCount;
    const targetId = workerIds[index];

    return cluster.default.workers?.[targetId];
};

if (cfg.cluster.enabled && cluster.default.isPrimary) {
    const cpus = Math.max(1, os.cpus().length);
    console.log(`Master ${process.pid} - forking ${cpus} workers`);

    const wire = (w: cluster.Worker) => {
        w.on('message', (msg: EventMessage) => {
            for (const id in cluster.default.workers) {
                const wk = cluster.default.workers[id];
                if (wk && wk.isConnected()) {
                    wk.send({
                        type: EventMessageType.Event,
                        payload: msg.payload,
                    });
                }
            }
        });
    };

    const forkOne = () => {
        const w = cluster.default.fork({
            ...process.env,
        });
        wire(w);

        return w;
    };

    for (let i = 0; i < cpus; i++) {
        forkOne();
    }

    rebuildWorkerIds();

    const server = net.createServer(
        {
            pauseOnConnect: true,
        },
        (socket: net.Socket) => {
            const clientKey = getClientKey(socket);

            const targetWorker = pickWorkerByKey(clientKey);

            if (targetWorker && targetWorker.isConnected()) {
                targetWorker.send(
                    {
                        type: EventMessageType.StickyConnection,
                    },
                    socket,
                );
            } else {
                socket.destroy();
            }
        },
    );

    server.listen(cfg.server.wsPort, () => {
        console.log(`Master ${process.pid} WS sticky @ ${cfg.server.wsPort}${cfg.server.wsPath}`);
    });

    cluster.default.on('exit', (worker: cluster.Worker) => {
        cfg.app.logsEnabled && console.warn(`Worker ${worker.process.pid} exited, respawning`);

        wire(
            cluster.default.fork({
                ...process.env,
            }),
        );

        rebuildWorkerIds();
    });

    cluster.default.on(`online`, rebuildWorkerIds);
    cluster.default.on(`listening`, rebuildWorkerIds);
    cluster.default.on(`disconnect`, rebuildWorkerIds);
} else {
    startWorker().catch(err => {
        console.error('worker error', err);
        process.exit(1);
    });
}
