import { config } from '@fisch0920/config/eslint'
import simpleImportSort from 'eslint-plugin-simple-import-sort' // <-- 1. Import the plugin.

export default [
  ...config,
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: { // <-- 2. Register the plugin.
      'simple-import-sort': simpleImportSort
    },
    rules: {
      'simple-import-sort/imports': 'error', // <-- 3. Enable the import sort rule.
      '@typescript-eslint/no-unused-vars': 'error', // <-- Also enable the no-unused-vars rule.

      // --- Rules that were previously turned off ---
      'react/prop-types': 'off',
      'unicorn/no-array-reduce': 'off',
      'unicorn/filename-case': 'off',
      'unicorn/prefer-global-this': 'off',
      'no-process-env': 'off',
      'array-callback-return': 'off',
      'jsx-a11y/click-events-have-key-events': 'off',
      'jsx-a11y/no-static-element-interactions': 'off',
      'jsx-a11y/media-has-caption': 'off',
      'jsx-a11y/interactive-supports-focus': 'off',
      'jsx-a11y/anchor-is-valid': 'off',
      '@typescript-eslint/naming-convention': 'off'
    }
  }
]