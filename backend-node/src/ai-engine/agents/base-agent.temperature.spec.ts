import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('BaseAgent runtime temperature wiring', () => {
  const source = readFileSync(join(__dirname, 'base-agent.js'), 'utf8');
  const phase2Source = readFileSync(
    join(__dirname, '../graphs/mc-component-graph-phase2.js'),
    'utf8',
  );
  const vue3GraphSource = readFileSync(
    join(__dirname, '../graphs/mc-component-graph-vue3.js'),
    'utf8',
  );
  const liteSource = readFileSync(join(__dirname, '../../lite/lite.service.ts'), 'utf8');

  it('rebuilds and reattaches the LLM when runtime temperature changes', () => {
    expect(source).toContain('_setRuntimeTemperature');
    expect(source).toMatch(/this\.temperature\s*=\s*nextTemperature/);
    expect(source).toMatch(/this\.llm\s*=\s*this\._buildLLM\(\)/);
    expect(source).toMatch(/this\._attachUnifiedInvoke\(\)/);
    expect(source).toContain('_restoreRuntimeTemperature');
  });

  it('keeps provider model normalization as the runtime temperature source of truth', () => {
    expect(source).toContain('normalizeRequestTemperature(');
    expect(source).toContain('requestedTemperature');
    expect(source).toMatch(
      /_temperatureBaseline\s*=\s*this\.temperature/,
    );
  });

  it.each([
    ['microcode max', phase2Source],
    ['vue3 max', vue3GraphSource],
  ])('透传 %s 的文本代码生成温度', (_name, graphSource) => {
    expect(graphSource).toMatch(
      /temperature:\s*\n?\s*textCfg\.temperature\s*\?\?\s*\n?\s*textCfg\.textTemperature\s*\?\?\s*\n?\s*textCfg\.unifiedTemperature/s,
    );
  });

  it('keeps lite codegen temperature independent from vision temperature', () => {
    expect(liteSource).toContain('codegenTemperature: this.resolveCodegenTemperature(dto)');
    expect(liteSource).toContain('const raw = dto?.config?.codegenTemperature;');
    expect(liteSource).toContain('return LITE_CODEGEN_BASE_TEMPERATURE;');
  });
});
