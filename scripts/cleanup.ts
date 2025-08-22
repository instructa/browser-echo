#!/usr/bin/env tsx
/**
 * Cleanup Script for Monorepo
 *
 * Removes all `dist` and `node_modules` directories inside `packages/*` and `example/*`,
 * plus the root-level `node_modules`. Also removes framework build dirs in examples:
 * `.nuxt`, `.next`, `.tanstack`, `.nitro`, `.output`.
 * Optionally runs `pnpm install` + `pnpm build` afterwards.
 * Additionally, prunes stale Browser Echo discovery files from CWD and tmpdir.
 *
 * Usage:
 *   pnpm tsx scripts/cleanup.ts [--install|-i]
 */

import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { globSync } from 'glob'
import { tmpdir } from 'node:os'

const args = process.argv.slice(2)
const runInstall = args.includes('--install') || args.includes('-i')
const rootPath = path.resolve('.')

function run(command: string, cwd: string) {
  console.log(`$ ${command}`)
  execSync(command, { stdio: 'inherit', cwd })
}

function findTargets(): string[] {
  const patterns = [
    'node_modules',
    'packages/*/dist',
    'packages/*/node_modules',
    'example/*/dist',
    'example/*/node_modules',
    'example/*/.nuxt',
    'example/*/.next',
    'example/*/.tanstack',
    'example/*/.nitro',
    'example/*/.output'
  ]

  const matches = patterns.flatMap(pattern =>
    globSync(pattern, { cwd: rootPath, absolute: true, dot: true, strict: false })
  )

  const uniqueDirs = Array.from(new Set(matches))
    .filter(p => {
      try {
        return fs.existsSync(p) && fs.statSync(p).isDirectory()
      } catch {
        return false
      }
    })

  return uniqueDirs
}

function removeDirectory(targetPath: string) {
  try {
    fs.rmSync(targetPath, { recursive: true, force: true, maxRetries: 3 })
    console.log(`🗑️  Removed ${path.relative(rootPath, targetPath)}`)
  } catch (error) {
    console.warn(`⚠️  Failed to remove ${targetPath}:`, error)
  }
}

function pruneDiscoveryFiles() {
  const candidates = [
    path.join(rootPath, '.browser-echo-mcp.json'),
    path.join(tmpdir(), 'browser-echo-mcp.json')
  ]
  let count = 0
  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue
      const raw = fs.readFileSync(file, 'utf-8')
      const data = JSON.parse(raw)
      const ts = typeof data?.timestamp === 'number' ? data.timestamp : 0
      const pid = typeof data?.pid === 'number' ? data.pid : 0
      let stale = false
      if (ts && (Date.now() - ts) > 60 * 60 * 1000) stale = true // >1h old
      if (pid) {
        try { process.kill(pid, 0) } catch { stale = true }
      }
      if (stale) {
        fs.unlinkSync(file)
        count++
        console.log(`🧹 Removed stale discovery: ${file}`)
      }
    } catch {}
  }
  if (count) console.log(`✅ Pruned ${count} discovery file(s)`) 
}

function main() {
  console.log('🧹 Cleaning build and dependency dirs in root, packages/* and example/* ...')

  const targets = findTargets()

  if (targets.length === 0) {
    console.log('Nothing to clean. ✅')
  } else {
    targets.forEach(removeDirectory)
    console.log(`✅ Removed ${targets.length} directories`)
  }

  // Always prune discovery files
  pruneDiscoveryFiles()

  if (runInstall) {
    console.log('\n📦 Installing dependencies and building workspace...')
    run('pnpm install', rootPath)
    run('pnpm build', rootPath)
    console.log('✅ Install and build complete')
  }
}

main()


