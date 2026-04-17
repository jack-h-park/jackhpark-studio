import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const repoRoot = process.cwd()
const sharedRepoRoot = process.env.JACKHPARK_AI_SKILLS_PATH
  ? path.resolve(process.env.JACKHPARK_AI_SKILLS_PATH)
  : path.resolve(repoRoot, '..', '..', '..', 'ai-assets', 'jackhpark-ai-skills')

const scanRoots = [
  'AGENTS.md',
  'CLAUDE.md',
  '.gemini',
  'ai',
  'docs'
]

const forbiddenPatterns = [
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

function pathForCanonicalReference(reference) {
  if (!reference.startsWith('jackhpark-ai-skills/')) {
    return path.join(repoRoot, reference)
  }

  return path.join(sharedRepoRoot, reference.replace('jackhpark-ai-skills/', ''))
}

const filesToScan = scanRoots
  .flatMap(listFiles)
  .filter((filePath) => /\.(md|mdx|ts|tsx|js|mjs|cjs|json)$/.test(filePath))

for (const filePath of filesToScan) {
  const content = read(filePath)

  for (const pattern of forbiddenPatterns) {
    if (content.includes(pattern)) {
      errors.push(`${relative(filePath)} contains forbidden legacy reference: ${pattern}`)
    }
  }
}

const wrapperRoot = path.join(repoRoot, 'ai', 'skill-wrappers')
const wrapperFiles = existsSync(wrapperRoot)
  ? listFiles(path.relative(repoRoot, wrapperRoot)).filter((filePath) => filePath.endsWith('/SKILL.md'))
  : []

for (const filePath of wrapperFiles) {
  const content = read(filePath)
  const canonicalSkill = content.match(/Canonical skill:\s*`([^`]+)`/)
  const localAdapter = content.match(/Local adapter:\s*`([^`]+)`/)

  if (!canonicalSkill) {
    errors.push(`${relative(filePath)} is missing a Canonical skill binding`)
  } else if (!existsSync(pathForCanonicalReference(canonicalSkill[1]))) {
    errors.push(`${relative(filePath)} references missing canonical skill: ${canonicalSkill[1]}`)
  }

  if (!localAdapter) {
    errors.push(`${relative(filePath)} is missing a Local adapter binding`)
  } else if (!existsSync(path.join(repoRoot, localAdapter[1]))) {
    errors.push(`${relative(filePath)} references missing local adapter: ${localAdapter[1]}`)
  }
}

const adapterFiles = listFiles('docs').filter((filePath) => filePath.endsWith('-local-adapter.md'))

for (const filePath of adapterFiles) {
  const content = read(filePath)

  if (!content.includes('jackhpark-ai-skills/playbooks/')) {
    errors.push(`${relative(filePath)} is missing a canonical playbook reference`)
  }

  if (!content.includes('jackhpark-ai-skills/skills/')) {
    errors.push(`${relative(filePath)} is missing a canonical skill reference`)
  }

  const canonicalReferences = [...content.matchAll(/`(jackhpark-ai-skills\/(?:playbooks|skills)\/[^`]+)`/g)]
    .map((match) => match[1])
    .filter((reference) => reference.endsWith('.md') || reference.endsWith('/SKILL.md'))

  for (const reference of canonicalReferences) {
    if (!existsSync(pathForCanonicalReference(reference))) {
      errors.push(`${relative(filePath)} references missing canonical asset: ${reference}`)
    }
  }
}

if (errors.length > 0) {
  console.error('AI docs integrity check failed:')
  for (const error of errors) {
    console.error(`- ${error}`)
  }
  process.exit(1)
}

console.log('AI docs integrity check passed.')
