import { ClientManager } from '../src/clientManager';

const mockWs = (bufferedAmount = 0) => {
    const handlers: Record<string, Function[]> = {};
    const ws: any = {
        OPEN: 1,
        readyState: 1,
        bufferedAmount,
        send: jest.fn(),
        terminate: jest.fn(),
        on: (ev: string, cb: Function) => {
            handlers[ev] = handlers[ev] || [];
            handlers[ev].push(cb);
        },
        emit: (ev: string, ...args: any[]) => {
            (handlers[ev] || []).forEach(cb => cb(...args));
        },
    };
    return ws;
};

describe('ClientManager', () => {
    // To hide console messages
    let warnSpy: jest.SpyInstance;

    beforeEach(() => {
        jest.useFakeTimers();
        jest.clearAllMocks();
        warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.useRealTimers();
        warnSpy.mockRestore();
    });

    it('starts paused and resumes on command', () => {
        const mgr = new ClientManager();
        const ws: any = mockWs();
        const id = mgr.addClient(ws);

        expect(mgr.listClients().find(c => c.id === id)?.paused).toBe(true);

        ws.emit('message', JSON.stringify({ type: 'resume' }));
        expect(mgr.listClients().find(c => c.id === id)?.paused).toBe(false);

        ws.emit('message', JSON.stringify({ type: 'pause' }));
        expect(mgr.listClients().find(c => c.id === id)?.paused).toBe(true);
    });

    it('drops messages for slow clients', () => {
        const mgr = new ClientManager();
        const ws: any = mockWs(2_000_000);
        const id = mgr.addClient(ws);

        ws.emit('message', JSON.stringify({ type: 'resume' }));

        ws.send.mockClear();
        mgr.broadcastEvent({ a: 1 });

        jest.advanceTimersByTime(1000);

        expect(ws.send).not.toHaveBeenCalled();
        mgr.removeClient(id);
    });

    it('filters with OR/AND', () => {
        const mgr = new ClientManager();

        const fast: any = mockWs();
        const id = mgr.addClient(fast);
        // To hide warn
        void id;

        fast.emit('message', JSON.stringify({ type: 'setFilters', filters: [{ expr: 'a == `1`' }] }));
        fast.emit('message', JSON.stringify({ type: 'resume' }));
        mgr.broadcastEvent({ a: 1 });

        expect(fast.send).toHaveBeenCalled();

        const andClient: any = mockWs();
        const id2 = mgr.addClient(andClient);
        // To hide warn
        void id2;

        andClient.emit(
            'message',
            JSON.stringify({
                type: 'setFilters',
                filters: [{ expr: 'a == `1`' }, { expr: 'b == `2`' }],
            }),
        );
        andClient.emit('message', JSON.stringify({ type: 'setMode', mode: 'AND' }));
        andClient.emit('message', JSON.stringify({ type: 'resume' }));
        mgr.broadcastEvent({ a: 1, b: 2 });

        expect(andClient.send).toHaveBeenCalled();
    });
});
