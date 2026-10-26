// Strips files the Sites uploader refuses (hidden files and source maps)
// from the build output, so `deploy.json` can point straight at dist/.
import { readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Removing a .map leaves a dangling //# sourceMappingURL= behind, which makes
// `wrangler deploy` fail on the missing file. Drop the reference too.
const SOURCE_MAPPING_URL = /^\/\/#\s*sourceMappingURL=.*$\n?/gm

function clean(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (name.startsWith('.') || name.endsWith('.map')) {
      rmSync(path, { recursive: true, force: true })
      continue
    }
    if (statSync(path).isDirectory()) {
      clean(path)
      continue
    }
    if (name.endsWith('.js') || name.endsWith('.mjs')) {
      const source = readFileSync(path, 'utf8')
      const stripped = source.replace(SOURCE_MAPPING_URL, '')
      if (stripped !== source) writeFileSync(path, stripped)
    }
  }
}

clean(new URL('../dist', import.meta.url).pathname)
