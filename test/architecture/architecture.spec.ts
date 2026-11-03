import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import {
  allViolations,
  controllerSurfaceViolations,
  importViolations,
  queryReadOnlyViolations,
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
          'modules/booking/controllers/client-bookings.controller.ts',
          good,
        ),
      ),
    ).toEqual([]);
    expect(
      controllerSurfaceViolations(
        controller(
          'modules/booking/controllers/client-x.controller.ts',
          good.replace("'client/", "'v1/client/"),
        ),
      ),
    ).toEqual([]);
  });

  it('flags a route prefix that disagrees with the folder', () => {
    const [violation] = controllerSurfaceViolations(
      controller(
        'modules/booking/controllers/admin-bookings.controller.ts',
        `@AdminApi()\n@Controller('client/bookings')\nclass C {}`,
      ),
    );
    expect(violation?.message).toContain('must start with "admin/"');
  });

  it('flags a missing or wrong surface decorator', () => {
    expect(
      controllerSurfaceViolations(
        controller(
          'modules/booking/controllers/admin-x.controller.ts',
          `@Controller('admin/bookings')\nclass C {}`,
        ),
      )[0]?.message,
    ).toContain('@AdminApi()');
    expect(
      controllerSurfaceViolations(
        controller(
          'modules/booking/controllers/admin-x.controller.ts',
          `@PlatformApi()\n@Controller('admin/bookings')\nclass C {}`,
        ),
      ),
    ).toHaveLength(1);
  });

  it('flags a file name that does not start with a surface', () => {
    expect(
      controllerSurfaceViolations(
        controller('modules/booking/controllers/staff-x.controller.ts', good),
      )[0]?.message,
    ).toContain('must start with a surface');
  });

  it('ignores files that are not surface controllers', () => {
    expect(
      controllerSurfaceViolations(
        controller(
          'modules/identity/controllers/auth.controller.ts',
          `@AuthApi()\n@Controller('v1/auth')\nclass C {}`,
        ),
      ),
    ).toEqual([]);
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

  it('lets the composition root wire modules together', () => {
    expect(
      importViolations(
        file(
          'app.module.ts',
          "import { IdentityModule } from './modules/identity/index.js';",
        ),
        SRC,
      ),
    ).toEqual([]);
  });

  it('keeps queries/ read-only', () => {
    const query = (content: string) =>
      queryReadOnlyViolations(
        file('modules/booking/queries/admin-booking.queries.ts', content),
      );
    expect(query('return this.prisma.booking.findMany({});')).toEqual([]);
    expect(query('await this.prisma.booking.update({});')[0]?.rule).toBe(
      'queries-read-only',
    );
    expect(query('await this.prisma.$executeRaw`UPDATE x`;')).toHaveLength(1);
    // The same call in services/ is fine.
    expect(
      queryReadOnlyViolations(
        file(
          'modules/booking/services/x.service.ts',
          'prisma.booking.update()',
        ),
      ),
    ).toEqual([]);
  });
});
