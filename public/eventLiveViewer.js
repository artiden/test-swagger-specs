const DOM = {
    wsUrl: document.getElementById('wsUrl'),
    connDot: document.getElementById('connDot'),
    connStatus: document.getElementById('connStatus'),
    togglePauseBtn: document.getElementById('togglePauseBtn'),
    events: document.getElementById('events'),
    exprInput: document.getElementById('exprInput'),
    addFilterBtn: document.getElementById('addFilterBtn'),
    filterList: document.getElementById('filterList'),
    clearFiltersBtn: document.getElementById('clearFiltersBtn'),
    modeSelect: document.getElementById('modeSelect'),
    reconnectBtn: document.getElementById('reconnectBtn'),
    flushBtn: document.getElementById('flushBtn')
};

const showSystemMessages = true;

let ws = null;
let connected = false;
let clientPaused = true;
let filters = [];
let mode = 'OR';

const BASE_BACKOFF = 1000;
const MAX_BACKOFF = 30000;
let backoff = BASE_BACKOFF;
let reconnectTimer = null;
let manualClose = false;
let connId = 0;

let autoPaused = false;

document.addEventListener('visibilitychange', () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    if (document.hidden) {
        if (!clientPaused) {
            ws.send(JSON.stringify({ type: 'pause', reason: 'tab-visibility' }));
            autoPaused = true;
        }
    } else {
        if (autoPaused) {
            ws.send(JSON.stringify({ type: 'resume', reason: 'tab-visibility' }));
            autoPaused = false;
        }
    }
});

function safeJSON(obj) {
    try {
        return JSON.stringify(obj);
    } catch {
        return String(obj);
    }
}

function setConnStatus(text, color) {
    DOM.connStatus.textContent = text;
    DOM.connDot.style.background = color;
}

function prependEventNode(node) {
    DOM.events.insertBefore(node, DOM.events.firstChild);
}

function nowISO() {
    return new Date().toISOString();
}

function renderFiltersUI() {
    DOM.filterList.innerHTML = '';
    filters.forEach((f, idx) => {
        const item = document.createElement('div');
        item.className = 'filterItem';
        const left = document.createElement('div');
        left.innerHTML = `<code style="color:var(--text)">${escapeHTML(f.expr)}</code>`;
        const btn = document.createElement('button');
        btn.className = 'danger';
        btn.textContent = 'Remove';
        btn.onclick = () => {
            filters.splice(idx, 1);
            renderFiltersUI();
            sendFiltersToServer();
        };
        item.appendChild(left);
        item.appendChild(btn);
        DOM.filterList.appendChild(item);
    });
}

function escapeHTML(s) {
    return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function clearReconnectTimer() {
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
}

function armReconnect() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        return;
    }
    if (reconnectTimer) {
        return;
    }
    if (manualClose) {
        return;
    }
    const delay = Math.min(backoff, MAX_BACKOFF);
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        backoff = Math.min(backoff * 2, MAX_BACKOFF);
        connect();
    }, delay);
}

function scheduleReconnect() {
    armReconnect();
}

function connect() {
    const url = DOM.wsUrl.value.trim();
    if (!url) {
        setConnStatus('invalid ws url', '#f43f5e');
        return;
    }

    const myId = ++connId;
    setConnStatus('connecting…', '#f97316');

    const next = new WebSocket(url);
    ws = next;

    next.addEventListener('open', () => {
        if (myId !== connId) {
            return;
        }
        connected = true;
        clearReconnectTimer();
        backoff = BASE_BACKOFF;
        setConnStatus('connected', '#10b981');
        updateToggleButton();
    });

    next.addEventListener('message', (ev) => {
        if (myId !== connId) {
            return;
        }
        handleServerMessage(ev.data);
    });

    next.addEventListener('close', (ev) => {
        if (myId !== connId) {
            return;
        }
        connected = false;
        setConnStatus(`disconnected (code=${ev.code || 'n/a'})`, '#f97316');
        if (manualClose) {
            manualClose = false;
            return;
        }
        armReconnect();
    });

    next.addEventListener('error', (e) => {
        if (myId !== connId) {
            return;
        }
        setConnStatus('error', '#ef4444');
        armReconnect();
        console.warn('WebSocket error', e);
    });
}

function handleServerMessage(raw) {
    let msg;
    try {
        msg = JSON.parse(raw);
    } catch {
        appendEvent({ _raw: raw }, 'raw');
        return;
    }

    switch (msg.type) {
        case 'welcome': {
            clientPaused = Boolean(msg.paused);
            appendSystem(`welcome (id=${msg.id}, paused=${clientPaused})`);

            if (Array.isArray(msg.filters) && msg.filters.length) {
                filters = msg.filters.map(f => ({ expr: f.expr || String(f) }));
                renderFiltersUI();
            }

            if (msg.mode) {
                mode = msg.mode === 'AND' ? 'AND' : 'OR';
                DOM.modeSelect.value = mode;
            }

            updateToggleButton();

            try { sendModeToServer(); } catch {}
            try { sendFiltersToServer(); } catch {}

            break;
        }

        case 'paused':
        case 'resumed': {
            clientPaused = (msg.type === 'paused');
            updateToggleButton();
            appendSystem(`server: ${msg.type}${msg.reason ? ' (' + msg.reason + ')' : ''}`);
            break;
        }

        case 'filtersSet': {
            appendSystem(`filters applied (count=${msg.count ?? filters.length})`);
            break;
        }

        case 'modeSet': {
            appendSystem(`mode set: ${msg.mode}`);
            break;
        }

        case 'inactivitySet': {
            appendSystem(`inactivity set: ${msg.ms}`);
            break;
        }

        case 'event': {
            if (msg.payload !== undefined) {
                appendEvent(msg.payload, 'event', msg.ts);
            }
            break;
        }

        default: {
            appendSystem('unknown message: ' + safeJSON(msg));
            break;
        }
    }
}

function appendEvent(payload, kind = 'event', ts) {
    const node = document.createElement('div');
    node.className = 'event';
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = `[${ts ? new Date(ts).toISOString() : nowISO()}] ${kind}`;
    const body = document.createElement('pre');
    body.style.margin = '6px 0 0 0';
    body.style.whiteSpace = 'pre-wrap';
    body.textContent = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
    node.appendChild(meta);
    node.appendChild(body);
    prependEventNode(node);
}

function appendSystem(text) {
    if (!showSystemMessages) {
        return;
    }
    const node = document.createElement('div');
    node.className = 'event';
    node.innerHTML = `<div class="meta">[${nowISO()}] system</div><div style="margin-top:6px;color:var(--muted)">${escapeHTML(text)}</div>`;
    prependEventNode(node);
}

function sendFiltersToServer() {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        return;
    }
    try {
        const payload = { type: 'setFilters', filters: filters.map(f => ({ expr: f.expr })) };
        ws.send(JSON.stringify(payload));
    } catch (e) {
        console.warn('sendFilters failed', e);
    }
}

function sendModeToServer() {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        return;
    }
    try {
        ws.send(JSON.stringify({ type: 'setMode', mode }));
    } catch (e) {}
}

function sendSetInactivity() {
}

function updateToggleButton() {
    DOM.togglePauseBtn.textContent = clientPaused ? '▶ Start' : '⏸ Pause';
}

function togglePause() {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        appendSystem('Not connected — cannot toggle pause. Reconnecting...');
        connect();
        return;
    }

    autoPaused = false;
    if (clientPaused) {
        ws.send(JSON.stringify({ type: 'resume' }));
    } else {
        ws.send(JSON.stringify({ type: 'pause' }));
    }
}

DOM.addFilterBtn.addEventListener('click', () => {
    const expr = DOM.exprInput.value.trim();
    if (!expr) {
        return;
    }
    filters.push({ expr });
    DOM.exprInput.value = '';
    renderFiltersUI();
    sendFiltersToServer();
});

DOM.clearFiltersBtn.addEventListener('click', () => {
    filters = [];
    renderFiltersUI();
    sendFiltersToServer();
});

DOM.modeSelect.addEventListener('change', (e) => {
    mode = e.target.value === 'AND' ? 'AND' : 'OR';
    sendModeToServer();
});

DOM.togglePauseBtn.addEventListener('click', togglePause);

DOM.reconnectBtn.addEventListener('click', () => {
    appendSystem('Manual reconnect requested');
    backoff = BASE_BACKOFF;
    clearReconnectTimer();
    manualClose = true;
    try {
        if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
            ws.close(1000, 'manual reconnect');
        }
    } catch {}
    connect();
});

DOM.flushBtn.addEventListener('click', () => {
    DOM.events.innerHTML = '';
});

DOM.wsUrl.addEventListener('change', () => {
    appendSystem('WS URL changed, reconnecting...');
    backoff = BASE_BACKOFF;
    clearReconnectTimer();
    manualClose = true;
    try {
        if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
            ws.close(1000, 'url changed');
        }
    } catch {}
    connect();
});

(function init() {
    renderFiltersUI();
    updateToggleButton();
    connect();
})();
