import * as jmespath from 'jmespath';

import { EventPayload, FilterMode, FilterRule } from './types';

export type CompiledFilter = {
    src: string;
    compiled: (data: any) => any;
};

export function compileRule(rule: FilterRule): CompiledFilter {
    const expr = rule.expr;

    // Create a small wrapper that calls jmespath.search on demand.
    const compiledFn = (input: any) => {
        try {
            return jmespath.search(input, expr);
        } catch (e) {
            // If expression is invalid or evaluation fails, treat as false.
            return false;
        }
    };

    return { src: expr, compiled: compiledFn };
}

export function compileRules(rules: FilterRule[] = []): CompiledFilter[] {
    return rules.map(compileRule);
}

export function evalRule(compiled: CompiledFilter, event: EventPayload): boolean {
    try {
        const res = compiled.compiled(event);

        return !!res;
    } catch {
        return false;
    }
}

export function evalRules(compiledList: CompiledFilter[], event: EventPayload, mode: FilterMode): boolean {
    if (!compiledList || compiledList.length === 0) {
        return true;
    }

    if (mode === 'AND') {
        for (const c of compiledList) {
            if (!evalRule(c, event)) {
                return false;
            }
        }

        return true;
    } else {
        for (const c of compiledList) {
            if (evalRule(c, event)) {
                return true;
            }
        }

        return false;
    }
}
