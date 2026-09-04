import { defineConfig } from 'checkly'
import { config as loadEnv } from 'dotenv'

// `checkly deploy`/`test` run this file directly with Node, outside Next.js,
// so .env.local is not picked up automatically the way it is for the app.
// Loaded here (not in the check file) so it's available before any
// __checks__ file that reads process.env for alert-channel secrets.
loadEnv({ path: '.env.local' })

/**
 * See https://www.checklyhq.com/docs/cli/project-structure/
 */
const config = defineConfig({
  /* A human friendly name for your project */
  projectName: 'jackhpark-studio',
  /** A logical ID that needs to be unique across your Checkly account,
  * See https://www.checklyhq.com/docs/cli/constructs/ to learn more about logical IDs.
  */
  logicalId: 'jackhpark-studio',
  /* Sets default values for Checks */
  checks: {
    /* A default for how often your Check should run in minutes */
    frequency: 5,
    /* Checkly data centers to run your Checks as monitors */
    locations: ['us-east-1', 'ap-northeast-2'],
    /** The Checkly Runtime identifier, determining npm packages and the Node.js version available at runtime.
     * See https://www.checklyhq.com/docs/cli/npm-packages/
     */
    runtimeId: '2025.04',
    /* A glob pattern that matches the Checks inside your repo, see https://www.checklyhq.com/docs/constructs/including-checks/#checks-checkmatch */
    checkMatch: '**/__checks__/**/*.check.ts',
    /* Global configuration option for Browser and Multistep checks. See https://www.checklyhq.com/docs/browser-checks/playwright-test/#global-configuration */
    playwrightConfig: {
      timeout: 30_000,
      use: {
          baseURL: 'https://www.jackhpark.com',
        viewport: { width: 1280, height: 720 },
      },
    },
    browserChecks: {
      /* A glob pattern matches any Playwright .spec.ts files and automagically creates a Browser Check. This way, you
      * can just write Playwright code. See https://www.checklyhq.com/docs/constructs/including-checks/#browserchecks-testmatch
      * */
      testMatch: '**/__checks__/**/*.spec.ts',
    },
  },
  cli: {
    /* The default datacenter location to use when running npx checkly test */
    runLocation: 'us-east-1',
    /* An array of default reporters to use when a reporter is not specified with the "--reporter" flag */
    reporters: ['list'],
    /* How many times to retry a failing test run when running `npx checkly test` or `npx checkly trigger` (max. 3) */
    retries: 0,
  },
})

export default config
