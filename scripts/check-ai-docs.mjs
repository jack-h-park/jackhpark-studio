import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const repoRoot = process.cwd()

const scanRoots = [
  'AGENTS.md',
  'CLAUDE.md',
  '.gemini',
  '.claude/skills',
  'docs'
]

const forbiddenPatterns = [
  'jackhpark-ai-skills/playbooks/',
  'jackhpark-ai-skills/skills/',
  'ai/skill-wrappers/',
  'shared-docs',
  'ai/shared-docs-source',
  'ai/skills/',
  'shared-playbooks',
  'advanced-settings-ux',
  'depth-violation-checklist',
  'api-smoke-chat',
  'api-smoke-test-summary',
  'telemetry-audit-checklist',
  'telemetry/audit.md',
  'telemetry-architecture.md',
  'operations/chat-user-guide.md'
]

const errors = []

// This script validates that this repository's AI skills stay self-contained and
// correctly paired with their companion docs. The methods used to live in a sibling
// jackhpark-ai-skills library bound through wrappers; that indirection is gone, so a
// reference to it now counts as a legacy reference.

function listFiles(entry) {
  const absolutePath = path.join(repoRoot, entry)

  if (!existsSync(absolutePath)) {
    return []
  }

  const stats = statSync(absolutePath)

  if (stats.isFile()) {
    return [absolutePath]
  }

  if (!stats.isDirectory()) {
    return []
  }

  return readdirSync(absolutePath).flatMap((name) => {
    if (name === 'node_modules' || name === '.next' || name === '.git') {
      return []
    }

    return listFiles(path.join(entry, name))
  })
}

function relative(filePath) {
  return path.relative(repoRoot, filePath)
}

function read(filePath) {
  return readFileSync(filePath, 'utf8')
}

const filesToScan = scanRoots
  .flatMap(listFiles)
  .filter((filePath) => /\.(md|mdx|ts|tsx|js|mjs|cjs|json)$/.test(filePath))

// Plan records under docs/implementation/plans/ describe what was proposed at the time and
// are not rewritten when the code moves on, so legacy paths there are history, not drift.
const archivedRecord = (filePath) => relative(filePath).startsWith('docs/implementation/plans/')

for (const filePath of filesToScan) {
  const content = read(filePath)

  if (archivedRecord(filePath)) {
    continue
  }

  for (const pattern of forbiddenPatterns) {
    if (content.includes(pattern)) {
      errors.push(`${relative(filePath)} contains forbidden legacy reference: ${pattern}`)
    }
  }
}

const skillsRoot = path.join(repoRoot, '.claude', 'skills')
const skillFiles = existsSync(skillsRoot)
  ? listFiles(path.relative(repoRoot, skillsRoot)).filter((filePath) => filePath.endsWith('/SKILL.md'))
  : []

if (skillFiles.length === 0) {
  errors.push('no skills found under .claude/skills — skills there are discoverable; elsewhere they are not')
}

// Every skill must be self-contained (a description that says when it applies, and a
// method) and must point at a companion doc that exists.
for (const filePath of skillFiles) {
  const content = read(filePath)

  if (!/^---[\s\S]*?\ndescription:\s*\S/m.test(content)) {
    errors.push(`${relative(filePath)} is missing a frontmatter description — without one the skill cannot be matched`)
  }

  if (!content.includes('# Method') && !content.includes('# Workflow')) {
    errors.push(`${relative(filePath)} has no Method or Workflow section — it is a pointer, not a skill`)
  }

  const companions = [...content.matchAll(/\((\.\.\/[^)]*docs\/[^)]+\.md)\)/g)].map((match) => match[1])

  for (const companion of companions) {
    const resolved = path.resolve(path.dirname(filePath), companion)
    if (!existsSync(resolved)) {
      errors.push(`${relative(filePath)} references missing companion doc: ${companion}`)
    }
  }
}

// Companion docs must point back at a skill that exists, so a rename cannot orphan a pair.
const adapterFiles = listFiles('docs').filter((filePath) => filePath.endsWith('-local-adapter.md'))

for (const filePath of adapterFiles) {
  const content = read(filePath)
  const backLinks = [...content.matchAll(/\((\.\.\/[^)]*\.claude\/skills\/[^)]+\/SKILL\.md)\)/g)].map((match) => match[1])

  if (backLinks.length === 0) {
    errors.push(`${relative(filePath)} does not link the skill it belongs to`)
    continue
  }

  for (const backLink of backLinks) {
    const resolved = path.resolve(path.dirname(filePath), backLink)
    if (!existsSync(resolved)) {
      errors.push(`${relative(filePath)} links a missing skill: ${backLink}`)
    }
  }
}

if (errors.length > 0) {
  console.error('AI skills check failed:')
  for (const error of errors) {
    console.error(`- ${error}`)
  }
  process.exit(1)
}

console.log('AI skills check passed.')
