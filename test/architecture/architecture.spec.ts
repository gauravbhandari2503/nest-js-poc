import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import {
  allViolations,
  controllerSurfaceViolations,
  importViolations,
  type SourceFile,
} from './rules.js';

const SRC = join(process.cwd(), 'src');

function sourceFiles(dir: string): SourceFile[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory())
      return name === 'generated' ? [] : sourceFiles(full);
    if (!name.endsWith('.ts') || name.endsWith('.spec.ts')) return [];
    return [
      {
        path: relative(SRC, full).split(sep).join('/'),
        content: readFileSync(full, 'utf8'),
      },
    ];
  });
}

describe('architecture rules', () => {
  it('holds for every file in src/', () => {
    const violations = sourceFiles(SRC).flatMap((file) =>
      allViolations(file, SRC),
    );
    expect(violations).toEqual([]);
  });
});

describe('the rules catch violations (so the check above means something)', () => {
  const controller = (path: string, content: string): SourceFile => ({
    path,
    content,
  });
  const good = `@ClientApi()\n@Controller('client/bookings')\nexport class C {}`;

  it('accepts a controller whose folder, prefix and decorator agree', () => {
    expect(
      controllerSurfaceViolations(
        controller(
          'modules/booking/controllers/client/client-bookings.controller.ts',
          good,
        ),
      ),
    ).toEqual([]);
    expect(
      controllerSurfaceViolations(
        controller(
          'modules/booking/controllers/client/x.controller.ts',
          good.replace("'client/", "'v1/client/"),
        ),
      ),
    ).toEqual([]);
  });

  it('flags a route prefix that disagrees with the folder', () => {
    const [violation] = controllerSurfaceViolations(
      controller(
        'modules/booking/controllers/admin/admin-bookings.controller.ts',
        `@AdminApi()\n@Controller('client/bookings')\nclass C {}`,
      ),
    );
    expect(violation?.message).toContain('must start with "admin/"');
  });

  it('flags a missing or wrong surface decorator', () => {
    expect(
      controllerSurfaceViolations(
        controller(
          'modules/booking/controllers/admin/x.controller.ts',
          `@Controller('admin/bookings')\nclass C {}`,
        ),
      )[0]?.message,
    ).toContain('@AdminApi()');
    expect(
      controllerSurfaceViolations(
        controller(
          'modules/booking/controllers/admin/x.controller.ts',
          `@PlatformApi()\n@Controller('admin/bookings')\nclass C {}`,
        ),
      ),
    ).toHaveLength(1);
  });

  it('flags a folder that is not a surface', () => {
    expect(
      controllerSurfaceViolations(
        controller('modules/booking/controllers/staff/x.controller.ts', good),
      )[0]?.message,
    ).toContain('not a surface');
  });

  it('ignores files that are not surface controllers', () => {
    expect(
      controllerSurfaceViolations(
        controller('app.controller.ts', 'class A {}'),
      ),
    ).toEqual([]);
    expect(
      controllerSurfaceViolations(
        controller('health/health.controller.ts', 'class A {}'),
      ),
    ).toEqual([]);
  });

  const file = (path: string, content: string): SourceFile => ({
    path,
    content,
  });

  it('allows a module to import another module through its index only', () => {
    expect(
      importViolations(
        file(
          'modules/booking/services/a.service.ts',
          "import { PricingService } from '../../pricing/index.js';",
        ),
        SRC,
      ),
    ).toEqual([]);
    const [violation] = importViolations(
      file(
        'modules/booking/services/a.service.ts',
        "import { PricingCalculator } from '../../pricing/domain/pricing.calculator.js';",
      ),
      SRC,
    );
    expect(violation?.rule).toBe('module-public-api');
  });

  it('allows a module to import its own internals and shared code', () => {
    expect(
      importViolations(
        file(
          'modules/booking/services/a.service.ts',
          "import { x } from '../domain/booking-state.js';\nimport { y } from '../../../common/money/index.js';\nimport { z } from '@nestjs/common';",
        ),
        SRC,
      ),
    ).toEqual([]);
  });

  it('forbids common/ and infrastructure from importing business modules', () => {
    const [violation] = importViolations(
      file(
        'common/errors/x.ts',
        "import { BookingService } from '../../modules/booking/index.js';",
      ),
      SRC,
    );
    expect(violation?.rule).toBe('no-modules-import-from-infrastructure');
  });
});
