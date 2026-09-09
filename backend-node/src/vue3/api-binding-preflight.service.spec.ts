import { BadRequestException } from '@nestjs/common';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ApiBindingPreflightService } from './api-binding-preflight.service';

describe('ApiBindingPreflightService', () => {
  let root: string;
  const service = new ApiBindingPreflightService();

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'mvgo-api-preflight-'));
    mkdirSync(join(root, 'package', 'api'), { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('accepts root-level Vue entry and colocated API modules', () => {
    writeFileSync(
      join(root, 'index.vue'),
      `<template><div>{{ rows.length }}</div></template>\n<script setup>\nimport flowApi from './api/flow.mjs'\nconst rows = []\nvoid flowApi\n</script>`,
    );
    mkdirSync(join(root, 'api'), { recursive: true });
    writeFileSync(
      join(root, 'api', 'flow.mjs'),
      `import { createRequest } from 'microvideo-request'\nexport default { list() { return createRequest().get('/list') } }`,
    );

    expect(() => service.validate(root)).not.toThrow();
  });

  it('accepts generated js modules with allowed bare dependencies', () => {
    writeFileSync(
      join(root, 'package', 'index.vue'),
      `<template><div>{{ rows.length }}</div></template>\n<script setup>\nimport flowApi from './api/flow.js'\nconst rows = []\nvoid flowApi\n</script>\n<style scoped>.x { color: red; }</style>`,
    );
    writeFileSync(
      join(root, 'package', 'api', 'flow.js'),
      `import { createRequest } from 'microvideo-request'\nexport default { list() { return createRequest().get('/list') } }`,
    );

    expect(() => service.validate(root)).not.toThrow();
  });

  it('rejects unknown bare dependencies in generated js modules before publish', () => {
    writeFileSync(
      join(root, 'package', 'index.vue'),
      `<template><div /></template>\n<script setup>\nimport value from './api/unsafe.js'\nvoid value\n</script>`,
    );
    writeFileSync(
      join(root, 'package', 'api', 'unsafe.js'),
      `import lodash from 'lodash'\nexport default lodash`,
    );

    expect(() => service.validate(root)).toThrow(BadRequestException);
  });

  it('keeps accepting historical mjs modules with allowed bare dependencies', () => {
    writeFileSync(
      join(root, 'package', 'index.vue'),
      `<template><div>{{ rows.length }}</div></template>\n<script setup>\nimport flowApi from './api/flow.mjs'\nconst rows = []\nvoid flowApi\n</script>`,
    );
    writeFileSync(
      join(root, 'package', 'api', 'flow.mjs'),
      `import { createRequest } from 'microvideo-request'\nexport default { list() { return createRequest().get('/list') } }`,
    );

    expect(() => service.validate(root)).not.toThrow();
  });

  it('rejects missing relative imports', () => {
    writeFileSync(
      join(root, 'package', 'index.vue'),
      `<template><div /></template>\n<script setup>\nimport missing from './api/missing.mjs'\nvoid missing\n</script>`,
    );

    expect(() => service.validate(root)).toThrow(BadRequestException);
  });

  it('does not apply API module dependency rules to unrelated helper js files', () => {
    writeFileSync(
      join(root, 'package', 'index.vue'),
      `<template><div /></template>\n<script setup>\nconst ready = true\nvoid ready\n</script>`,
    );
    mkdirSync(join(root, 'package', 'components'), { recursive: true });
    writeFileSync(
      join(root, 'package', 'components', 'helper.js'),
      `import customRuntime from 'component-only-runtime'\nexport default customRuntime`,
    );

    expect(() => service.validate(root)).not.toThrow();
  });
});
