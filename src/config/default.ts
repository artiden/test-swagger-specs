export interface AppConfig {
    app: {
        logsEnabled: boolean;
    };
    server: {
        httpPort: number;
        ingestBodyLimit: string;
        ingestPath: string;
        wsPath: string;
        wsPort: number;
    };
    cluster: {
        enabled: boolean;
    };
    client: {
        defaultFilters: string[];
    };
    maxBufferedAmount: number;
    pauseOnInactivityMs: number;
}

const defaultConfig: AppConfig = {
    app: {
        logsEnabled: process.env.LOGS_ENABLED ? Boolean(String(process.env.LOGS_ENABLED.toLowerCase()) === 'true') : false,
    },
    server: {
        httpPort: process.env.HTTP_PORT ? Number(process.env.HTTP_PORT) : 3000,
        ingestBodyLimit: process.env.INGEST_BODY_LIMIT ? String(process.env.INGEST_BODY_LIMIT) : `100mb`,
        ingestPath: process.env.INGEST_PATH ? String(process.env.INGEST_PATH) : `/ingest`,
        wsPath: process.env.WS_PATH ? String(process.env.WS_PATH) : `/ws`,
        wsPort: process.env.WS_PORT ? Number(process.env.WS_PORT) : 8080,
    },
    cluster: {
        enabled: process.env.CLUSTER_ENABLED ? Boolean(String(process.env.CLUSTER_ENABLED.toLowerCase()) === `true`) : true,
    },
    client: {
        defaultFilters: [`contains(fluent_tag, 's3.')`],
    },
    /** Per-client ws backpressure threshold (bytes). Messages are dropped above this. */
    maxBufferedAmount: 1_000_000,
    /** Auto-pause after inactivity from a client (ms). */
    pauseOnInactivityMs: 1000 * 60 * 5,
};

export default defaultConfig;
