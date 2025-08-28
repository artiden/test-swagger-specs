import { compileRules, evalRules } from '../src/filter';

describe('JMESPath filters', () => {
    const event = {
        level: 'error',
        message: 'timeout on api',
        service: 'api',
        meta: { code: 504, host: 'gw-1' },
    };

    it('simple equality', () => {
        const rules = compileRules([{ expr: "level == 'error'" }]);
        expect(evalRules(rules, event, 'OR')).toBe(true);
        const rules2 = compileRules([{ expr: "level == 'info'" }]);
        expect(evalRules(rules2, event, 'OR')).toBe(false);
    });

    it('contains builtin', () => {
        const rules = compileRules([{ expr: "contains(message, 'timeout')" }]);
        expect(evalRules(rules, event, 'OR')).toBe(true);
    });

    it('AND mode across two rules', () => {
        const rules = compileRules([{ expr: "service == 'api'" }, { expr: 'meta.code == `504`' }]);
        expect(evalRules(rules, event, 'AND')).toBe(true);
    });

    it('nested access', () => {
        const rules = compileRules([{ expr: "meta.host == 'gw-1'" }]);
        expect(evalRules(rules, event, 'OR')).toBe(true);
    });
});
