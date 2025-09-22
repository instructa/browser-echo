#!/usr/bin/env tsx
/**
 * Release Script for Monorepo
 *
 * This script automates the process of creating and publishing releases
 * for all workspace packages in packages/*.
 *
 * Usage:
 *   pnpm tsx scripts/release.ts [version-type] [--alpha] [--no-git] [--no-github] [--package <name>]
 *
 * version-type: 'major', 'minor', 'patch', or specific version (default: 'patch')
 * --alpha: Create an alpha release
 * --no-git: Skip git commit and tag
 * --no-github: Skip creating GitHub release
 * --package <name>: Release only a specific package (e.g., --package core)
 */

import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

// Parse command line arguments
const args = process.argv.slice(2)
const versionBumpArg = args.find(arg => !arg.startsWith('--')) || 'patch'
const isAlpha = args.includes('--alpha')
const skipGit = args.includes('--no-git')
const skipGitHub = args.includes('--no-github')
const packageIndex = args.findIndex(arg => arg === '--package')
const specificPackage = packageIndex !== -1 ? args[packageIndex + 1] : null

const rootPath = path.resolve('.')

function run(command: string, cwd: string) {
  console.log(`Executing: ${command} in ${cwd}`)
  execSync(command, { stdio: 'inherit', cwd })
}

/**
 * Get all workspace packages
 * @returns Array of package paths and info
 */
function getWorkspacePackages(): Array<{ path: string; name: string; version: string }> {
  const packagesDir = path.join(rootPath, 'packages')
  const packageDirs = fs.readdirSync(packagesDir).filter(dir => {
    const dirPath = path.join(packagesDir, dir)
    return fs.statSync(dirPath).isDirectory() && fs.existsSync(path.join(dirPath, 'package.json'))
  })

  return packageDirs.map(dir => {
    const pkgPath = path.join(packagesDir, dir)
    const pkgJsonPath = path.join(pkgPath, 'package.json')
    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'))
    return {
      path: pkgPath,
      name: pkgJson.name,
      version: pkgJson.version
    }
  })
}

/**
 * Bump version in package.json
 * @param pkgPath Path to the package directory
 * @param type Version bump type: 'major', 'minor', 'patch', or specific version
 * @param isAlpha Whether to create an alpha version
 * @returns The new version
 */
function bumpVersion(pkgPath: string, type: 'major' | 'minor' | 'patch' | string, isAlpha: boolean = false): string {
  const pkgJsonPath = path.join(pkgPath, 'package.json')
  const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'))
  const currentVersion = pkgJson.version
  let newVersion: string

  // Parse current version to check if it's already an alpha version
  const versionRegex = /^(\d+\.\d+\.\d+)(?:-alpha\.(\d+))?$/
  const match = currentVersion.match(versionRegex)

  if (!match) {
    throw new Error(`Invalid version format: ${currentVersion}`)
  }

  let baseVersion = match[1]
  const currentAlphaVersion = match[2] ? Number.parseInt(match[2], 10) : -1

  // Handle version bumping
  if (type === 'major' || type === 'minor' || type === 'patch') {
    const [major, minor, patch] = baseVersion.split('.').map(Number)

    // Bump version according to type
    if (type === 'major') {
      baseVersion = `${major + 1}.0.0`
    }
    else if (type === 'minor') {
      baseVersion = `${major}.${minor + 1}.0`
    }
    else { // patch
      baseVersion = `${major}.${minor}.${patch + 1}`
    }
  }
  else if (type.match(/^\d+\.\d+\.\d+$/)) {
    // Use the provided version string directly as base version
    baseVersion = type
  }
  else {
    throw new Error(`Invalid version bump type: ${type}. Use 'major', 'minor', 'patch', or a specific version like '1.2.3'.`)
  }

  // Create final version string
  if (isAlpha) {
    // For alpha releases, always start at alpha.0 when base version changes
    // If the base version is the same, increment the alpha number.
    const alphaVersion = baseVersion === match[1] ? currentAlphaVersion + 1 : 0
    if (alphaVersion < 0) {
      throw new Error(`Cannot create alpha version from non-alpha version ${currentVersion} without bumping base version (major, minor, patch, or specific).`)
    }
    newVersion = `${baseVersion}-alpha.${alphaVersion}`
  }
  else {
    // If bumping from an alpha version to a stable version, use the current or bumped baseVersion
    newVersion = baseVersion
  }

  // Update package.json
  pkgJson.version = newVersion
  fs.writeFileSync(pkgJsonPath, `${JSON.stringify(pkgJson, null, 2)}\n`)

  console.log(`Bumped version from ${currentVersion} to ${newVersion} in ${pkgJsonPath}`)
  return newVersion
}

/**
 * Update workspace dependencies to use published versions
 * @param packages Array of packages with their new versions
 */
function updateWorkspaceDependencies(packages: Array<{ path: string; name: string; version: string }>) {
  console.log('📦 Updating workspace dependencies to published versions...')
  
  const packageMap = new Map(packages.map(pkg => [pkg.name, pkg.version]))
  
  packages.forEach(pkg => {
    const pkgJsonPath = path.join(pkg.path, 'package.json')
    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'))
    let updated = false
    
    // Update dependencies
    if (pkgJson.dependencies) {
      for (const [depName, depVersion] of Object.entries(pkgJson.dependencies)) {
        if (depVersion === 'workspace:*' && packageMap.has(depName)) {
          pkgJson.dependencies[depName] = `^${packageMap.get(depName)}`
          updated = true
        }
      }
    }
    
    // Update devDependencies
    if (pkgJson.devDependencies) {
      for (const [depName, depVersion] of Object.entries(pkgJson.devDependencies)) {
        if (depVersion === 'workspace:*' && packageMap.has(depName)) {
          pkgJson.devDependencies[depName] = `^${packageMap.get(depName)}`
          updated = true
        }
      }
    }
    
    // Update peerDependencies
    if (pkgJson.peerDependencies) {
      for (const [depName, depVersion] of Object.entries(pkgJson.peerDependencies)) {
        if (depVersion === 'workspace:*' && packageMap.has(depName)) {
          pkgJson.peerDependencies[depName] = `^${packageMap.get(depName)}`
          updated = true
        }
      }
    }
    
    if (updated) {
      fs.writeFileSync(pkgJsonPath, `${JSON.stringify(pkgJson, null, 2)}\n`)
      console.log(`Updated dependencies in ${pkg.name}`)
    }
  })
}

/**
 * Restore workspace dependencies back to workspace:* format
 * @param packages Array of packages to restore
 */
function restoreWorkspaceDependencies(packages: Array<{ path: string; name: string; version: string }>) {
  console.log('🔄 Restoring workspace dependencies...')
  
  const packageNames = new Set(packages.map(pkg => pkg.name))
  
  packages.forEach(pkg => {
    const pkgJsonPath = path.join(pkg.path, 'package.json')
    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'))
    let updated = false
    
    // Restore dependencies
    if (pkgJson.dependencies) {
      for (const depName of Object.keys(pkgJson.dependencies)) {
        if (packageNames.has(depName)) {
          pkgJson.dependencies[depName] = 'workspace:*'
          updated = true
        }
      }
    }
    
    // Restore devDependencies
    if (pkgJson.devDependencies) {
      for (const depName of Object.keys(pkgJson.devDependencies)) {
        if (packageNames.has(depName)) {
          pkgJson.devDependencies[depName] = 'workspace:*'
          updated = true
        }
      }
    }
    
    // Restore peerDependencies
    if (pkgJson.peerDependencies) {
      for (const depName of Object.keys(pkgJson.peerDependencies)) {
        if (packageNames.has(depName)) {
          pkgJson.peerDependencies[depName] = 'workspace:*'
          updated = true
        }
      }
    }
    
    if (updated) {
      fs.writeFileSync(pkgJsonPath, `${JSON.stringify(pkgJson, null, 2)}\n`)
      console.log(`Restored workspace dependencies in ${pkg.name}`)
    }
  })
}

/**
 * Generate release notes for the GitHub release
 * @param packages Array of packages being released
 * @param version The version being released
 * @param isAlpha Whether this is an alpha release
 */
function generateReleaseNotes(packages: Array<{ name: string; version: string }>, version: string, isAlpha: boolean): string {
  const releaseType = isAlpha ? 'Alpha Release' : 'Release'
  const packageList = packages.map(pkg => `- \`${pkg.name}@${pkg.version}\``).join('\n')
  const firstPackage = packages[0]?.name || '@browser-echo/core'
  
  return `# ${releaseType} v${version}

## 📦 Published Packages

${packageList}

## 🚀 Installation

You can install any of these packages using your preferred package manager:

\`\`\`bash
# npm
npm install ${firstPackage}

# pnpm  
pnpm add ${firstPackage}

# yarn
yarn add ${firstPackage}
\`\`\`

${isAlpha ? '⚠️ **Note**: This is an alpha release and may contain experimental features.' : ''}
`
}

/**
 * Create a GitHub release
 * @param version The version to release
 * @param packages Array of packages being released
 * @param isAlpha Whether this is an alpha release
 */
function createGitHubRelease(version: string, packages: Array<{ name: string; version: string }>, isAlpha: boolean = false) {
  console.log('🐙 Creating GitHub release...')

  try {
    // Check if GitHub CLI is available
    try {
      execSync('gh --version', { stdio: 'pipe' })
    } catch {
      console.warn('⚠️ GitHub CLI (gh) not found. Skipping GitHub release creation.')
      console.log('💡 Install GitHub CLI: https://cli.github.com/')
      return
    }

    const releaseNotes = generateReleaseNotes(packages, version, isAlpha)
    const releaseTitle = isAlpha ? `Alpha Release v${version}` : `Release v${version}`
    
    // Create release notes file temporarily
    const releaseNotesPath = path.join(rootPath, 'temp-release-notes.md')
    fs.writeFileSync(releaseNotesPath, releaseNotes)

    try {
      // Create GitHub release
      const releaseCmd = [
        'gh release create',
        `v${version}`,
        `--title "${releaseTitle}"`,
        `--notes-file "${releaseNotesPath}"`,
        isAlpha ? '--prerelease' : '',
        '--verify-tag'
      ].filter(Boolean).join(' ')

      run(releaseCmd, rootPath)
      console.log(`✅ Successfully created GitHub release v${version}`)
    } finally {
      // Clean up temp file
      if (fs.existsSync(releaseNotesPath)) {
        fs.unlinkSync(releaseNotesPath)
      }
    }
  }
  catch (error) {
    console.error('❌ Failed to create GitHub release:', error)
    console.log('💡 You can create the release manually at: https://github.com/your-org/your-repo/releases/new')
    // Don't throw - GitHub release creation is optional
  }
}

/**
 * Create a git commit and tag for the release
 * @param version The version to tag
 * @param isAlpha Whether this is an alpha release
 */
function createGitCommitAndTag(version: string, isAlpha: boolean = false) {
  console.log('📝 Creating git commit and tag...')

  try {
    // Stage all package.json files and lockfile
    run('git add packages/*/package.json pnpm-lock.yaml', rootPath)

    // Create commit with version message
    const commitMsg = isAlpha
      ? `chore: alpha release v${version}`
      : `chore: release v${version}`
    run(`git commit -m "${commitMsg}"`, rootPath)

    // Create tag
    const tagMsg = isAlpha
      ? `Alpha Release v${version}`
      : `Release v${version}`
    run(`git tag -a v${version} -m "${tagMsg}"`, rootPath)

    // Push commit and tag to remote
    console.log('📤 Pushing commit and tag to remote...')
    run('git push', rootPath)
    run('git push --tags', rootPath)

    console.log(`✅ Successfully created and pushed git tag v${version}`)
  }
  catch (error) {
    console.error('❌ Failed to create git commit and tag:', error)
    throw error
  }
}

async function publishPackages() {
  console.log(`🚀 Starting ${isAlpha ? 'alpha' : ''} release process for workspace packages...`)
  console.log(`📝 Version bump: ${versionBumpArg}`)

  // Get all workspace packages
  const allPackages = getWorkspacePackages()
  console.log(`📦 Found ${allPackages.length} packages:`)
  allPackages.forEach(pkg => console.log(`  - ${pkg.name} (${pkg.version})`))

  // Filter packages if specific package requested
  const packagesToRelease = specificPackage 
    ? allPackages.filter(pkg => pkg.name.endsWith(`/${specificPackage}`) || pkg.name === specificPackage)
    : allPackages

  if (packagesToRelease.length === 0) {
    throw new Error(specificPackage 
      ? `Package "${specificPackage}" not found in workspace`
      : 'No packages found to release')
  }

  console.log(`📦 Releasing ${packagesToRelease.length} packages:`)
  packagesToRelease.forEach(pkg => console.log(`  - ${pkg.name}`))

  // Build all packages first
  console.log('🔨 Building all packages...')
  run('pnpm build', rootPath)

  let newVersion: string | undefined
  const updatedPackages: Array<{ path: string; name: string; version: string }> = []

  try {
    // Bump versions in all packages
    console.log(`📈 Bumping versions to ${versionBumpArg}${isAlpha ? ' (alpha)' : ''}...`)
    for (const pkg of packagesToRelease) {
      newVersion = bumpVersion(pkg.path, versionBumpArg, isAlpha)
      updatedPackages.push({
        path: pkg.path,
        name: pkg.name,
        version: newVersion
      })
      console.log(`  ${pkg.name}: ${pkg.version} → ${newVersion}`)
    }

    // Update workspace dependencies to use published versions
    updateWorkspaceDependencies(updatedPackages)

    // Create git commit and tag if not skipped
    if (!skipGit && newVersion) {
      createGitCommitAndTag(newVersion, isAlpha)
    }

    // Publish packages in dependency order (core first, then others)
    console.log(`📤 Publishing packages to npm...`)
    
    // Sort packages: core first, then others
    const sortedPackages = [...updatedPackages].sort((a, b) => {
      if (a.name.includes('/core')) return -1
      if (b.name.includes('/core')) return 1
      return 0
    })

    for (const pkg of sortedPackages) {
      console.log(`📤 Publishing ${pkg.name}@${pkg.version}...`)
      
      const publishCmd = isAlpha
        ? 'pnpm publish --tag alpha --no-git-checks --access public'
        : 'pnpm publish --no-git-checks --access public'

      run(publishCmd, pkg.path)
      console.log(`✅ Published ${pkg.name}@${pkg.version}`)
    }

    // Create GitHub release if not skipped
    if (!skipGitHub && newVersion) {
      createGitHubRelease(newVersion, updatedPackages, isAlpha)
    }

    console.log(`🎉 Successfully completed ${isAlpha ? 'alpha' : ''} release v${newVersion}!`)
    console.log(`📦 Published packages:`)
    updatedPackages.forEach(pkg => console.log(`  - ${pkg.name}@${pkg.version}`))

  } catch (error) {
    console.error('❌ Error during release process:', error)
    
    // Attempt to restore workspace dependencies on error
    if (updatedPackages.length > 0) {
      console.log('🔄 Attempting to restore workspace dependencies...')
      try {
        restoreWorkspaceDependencies(updatedPackages)
      } catch (restoreError) {
        console.error('Failed to restore workspace dependencies:', restoreError)
      }
    }
    
    throw error
  }
  
  // Restore workspace dependencies only after successful publish
  console.log('✅ All packages published successfully!')
  if (updatedPackages.length > 0) {
    restoreWorkspaceDependencies(updatedPackages)
  }
}

// Run the publish process
publishPackages().catch((error) => {
  console.error('❌ Error during release process:', error)
  process.exit(1)
})