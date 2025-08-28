import defaultConfig, { AppConfig } from './default';

import development from './development';
import production from './production';
import staging from './staging';

const env = (process.env.NODE_ENV || `development`).toLowerCase();

const map: Record<string, AppConfig> = {
    development,
    staging,
    production,
};

export default map[env] ?? defaultConfig;
