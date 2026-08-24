import { describe, expect, test } from 'bun:test'

import {
  InvalidBuildManifest,
  verifyBuildManifest,
} from './verify-build-manifest'

const validManifest = {
  'src/main.tsx': {
    file: 'assets/main.js',
    src: 'src/main.tsx',
    isEntry: true,
    assets: ['assets/brand.svg'],
    css: ['assets/main.css'],
    dynamicImports: ['src/pages/Dashboard.tsx'],
  },
  'src/pages/Dashboard.tsx': {
    file: 'assets/dashboard.js',
    src: 'src/pages/Dashboard.tsx',
    imports: ['src/main.tsx'],
  },
}

function verify(
  manifest: unknown,
  assets: ReadonlySet<string> = new Set([
    'assets/main.js',
    'assets/main.css',
    'assets/brand.svg',
    'assets/dashboard.js',
  ])
) {
  return verifyBuildManifest(manifest, {
    distDirectory: '/tmp/demo-dist',
    assetExists: async (assetPath) => assets.has(assetPath),
  })
}

describe('production build manifest verification', () => {
  test('accepts a complete entry graph whose assets exist', async () => {
    await expect(verify(validManifest)).resolves.toBeUndefined()
  })

  test('rejects a manifest without the required client entry', async () => {
    await expect(
      verify({
        'src/pages/Dashboard.tsx': {
          file: 'assets/dashboard.js',
          src: 'src/pages/Dashboard.tsx',
        },
      })
    ).rejects.toBeInstanceOf(InvalidBuildManifest)
  })

  test('rejects missing, unsafe, and dangling assets', async () => {
    const invalidManifest = {
      ...validManifest,
      'src/main.tsx': {
        ...validManifest['src/main.tsx'],
        file: '../main.js',
        dynamicImports: ['src/pages/Missing.tsx'],
      },
    }

    await expect(verify(invalidManifest, new Set())).rejects.toMatchObject({
      issues: expect.arrayContaining([
        'Manifest asset "../main.js" is not a safe relative path.',
        'Manifest asset "assets/main.css" does not exist.',
        'Manifest entry "src/main.tsx" references missing entry "src/pages/Missing.tsx".',
      ]),
    })
  })

  test('rejects malformed entry fields', async () => {
    await expect(
      verify({
        'src/main.tsx': {
          file: '',
          src: 42,
          isEntry: 'yes',
          css: 'assets/main.css',
        },
      })
    ).rejects.toBeInstanceOf(InvalidBuildManifest)
  })

  test('rejects existing files with the wrong JavaScript or CSS type', async () => {
    const invalidManifest = {
      ...validManifest,
      'src/main.tsx': {
        ...validManifest['src/main.tsx'],
        css: ['assets/dashboard.js'],
      },
      'src/pages/Dashboard.tsx': {
        ...validManifest['src/pages/Dashboard.tsx'],
        file: 'assets/brand.svg',
      },
    }

    await expect(verify(invalidManifest)).rejects.toMatchObject({
      issues: expect.arrayContaining([
        'Manifest entry "src/main.tsx" references non-CSS stylesheet "assets/dashboard.js".',
        'Reachable JavaScript entry "src/pages/Dashboard.tsx" emits non-JavaScript file "assets/brand.svg".',
      ]),
    })
  })
})
