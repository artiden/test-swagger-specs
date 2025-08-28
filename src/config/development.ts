import def, { AppConfig } from './default';

export default {
    ...def,
    cluster: {
        enabled: true,
    },
} as AppConfig;
