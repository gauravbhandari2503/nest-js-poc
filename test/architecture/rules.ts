import { dirname, relative, resolve, sep } from 'node:path';

export const SURFACES = [
  'public',
  'auth',
  'client',
  'admin',
  'platform',
  'webhooks',
] as const;
const SURFACE_DECORATOR: Record<string, string> = {
  public: 'PublicApi',
  auth: 'AuthApi',
  client: 'ClientApi',
  admin: 'AdminApi',
  platform: 'PlatformApi',
  webhooks: 'WebhookApi',
};

export interface SourceFile {
  /** Path relative to `src/`, with forward slashes: `modules/booking/controllers/client/x.controller.ts`. */
  path: string;
  content: string;
}

export interface Violation {
  file: string;
  rule: string;
  message: string;
}

const importSpecifiers = (content: string) =>
  [...content.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map(
    (m) => m[1]!,
  );

/**
 * Rule 1: a controller's file prefix, route prefix and surface decorator name the same surface.
 *   modules/booking/controllers/client-bookings.controller.ts
 *     -> @Controller('client/bookings') (an optional `v1/` is allowed) and @ClientApi()
 * The file name starts with the surface (`admin-`, `client-`, `platform-`, `public-`, `auth-`,
 * `webhooks-`), or is exactly `<surface>.controller.ts` (e.g. `auth.controller.ts`).
 */
export function controllerSurfaceViolations(file: SourceFile): Violation[] {
  const match = /^modules\/[^/]+\/controllers\/([^/]+)\.controller\.ts$/.exec(
    file.path,
  );
  if (!match) return [];
  const name = match[1]!;
  const surface = SURFACES.find((s) => name === s || name.startsWith(`${s}-`));
  const violation = (message: string): Violation[] => [
    { file: file.path, rule: 'controller-surface', message },
  ];

  if (!surface) {
    return violation(
      `file name "${name}.controller.ts" must start with a surface (${SURFACES.join(', ')}) followed by "-"`,
    );
  }
  const route = /@Controller\(\s*['"`]([^'"`]*)['"`]/.exec(file.content)?.[1];
  if (route === undefined)
    return violation(`needs @Controller('${surface}/...')`);
  const firstSegment = route.replace(/^\/?(v1\/)?/, '').split('/')[0];
  if (firstSegment !== surface) {
    return violation(
      `route prefix "${route}" must start with "${surface}/" to match its file name`,
    );
  }
  const decorator = SURFACE_DECORATOR[surface]!;
  if (!new RegExp(`@${decorator}\\(\\)`).test(file.content)) {
    return violation(
      `needs @${decorator}() so docs and access rules match the "${surface}" surface`,
    );
  }
  return [];
}

/**
 * Rule 2: a module may import another module only through its `index.ts`
 * (`modules/<other>/index.js`), never its services, repositories or DTOs directly.
 * Rule 3: code outside `modules/` (common, prisma, redis...) never imports from `modules/`.
 *   The composition roots (`app.module.ts`, `worker.module.ts`) are exempt: wiring modules together is their job.
 */
const COMPOSITION_ROOTS = ['app.module.ts', 'worker.module.ts'];

export function importViolations(
  file: SourceFile,
  srcRoot = '/src',
): Violation[] {
  const fromModule = /^modules\/([^/]+)\//.exec(file.path)?.[1];
  const out: Violation[] = [];

  for (const specifier of importSpecifiers(file.content)) {
    if (!specifier.startsWith('.')) continue;
    const target = relative(
      srcRoot,
      resolve(srcRoot, dirname(file.path), specifier),
    )
      .split(sep)
      .join('/');
    const toModule = /^modules\/([^/]+)(?:\/(.*))?$/.exec(target);
    if (!toModule) continue;
    const [, targetModule, rest] = toModule;

    if (!fromModule) {
      if (COMPOSITION_ROOTS.includes(file.path)) continue;
      out.push({
        file: file.path,
        rule: 'no-modules-import-from-infrastructure',
        message: `"${specifier}": code outside modules/ must not import from modules/${targetModule}`,
      });
    } else if (
      targetModule !== fromModule &&
      !/^index(\.js|\.ts)?$/.test(rest ?? 'index')
    ) {
      out.push({
        file: file.path,
        rule: 'module-public-api',
        message: `"${specifier}": import modules/${targetModule} through its index.js, not its internals`,
      });
    }
  }
  return out;
}

/**
 * Rule 4: `queries/` is read-only (GET endpoints). Writes and business rules live in `services/`.
 * Flags Prisma write calls and raw write SQL in `modules/<m>/queries/*.ts`.
 */
const WRITE_CALL =
  /\.\s*(create|createMany|createManyAndReturn|update|updateMany|upsert|delete|deleteMany)\s*\(|\$executeRaw/;

export function queryReadOnlyViolations(file: SourceFile): Violation[] {
  if (!/^modules\/[^/]+\/queries\/[^/]+\.ts$/.test(file.path)) return [];
  const match = WRITE_CALL.exec(file.content);
  return match
    ? [
        {
          file: file.path,
          rule: 'queries-read-only',
          message: `"${match[0].trim()}" is a write: move it to services/ (queries/ only reads)`,
        },
      ]
    : [];
}

export const allViolations = (file: SourceFile, srcRoot?: string) => [
  ...controllerSurfaceViolations(file),
  ...queryReadOnlyViolations(file),
  ...importViolations(file, srcRoot),
];
