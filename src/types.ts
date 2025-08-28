export type JSONValue = any;
export type EventPayload = Record<string, JSONValue>;

export interface FilterRule {
    expr: string;
}

export type FilterMode = `OR` | `AND`;

export interface ClientHello {
    type: 'welcome';
    id: string;
    paused: boolean;
    filters: FilterRule[];
    mode: FilterMode;
}

export interface ClientControlMsg {
    type: 'pause' | 'resume' | 'setFilters' | 'setMode' | 'setInactivity';
    filters?: FilterRule[];
    mode?: FilterMode;
    inactivityTimeoutMs?: number;
}

export const EventMessageType = {
    Event: `event`,
    StickyConnection: `sticky:connection`,
} as const;

type EventMessageTypeValues = typeof EventMessageType;
export type EventMessageType = EventMessageTypeValues[keyof EventMessageTypeValues];

export interface EventMessage {
    type: EventMessageType;
    payload: EventPayload[];
}
