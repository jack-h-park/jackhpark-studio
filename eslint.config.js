import { config } from '@fisch0920/config/eslint'
import simpleImportSort from 'eslint-plugin-simple-import-sort' // <-- 1. 플러그인을 import 합니다.

export default [
  ...config,
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: { // <-- 2. 플러그인을 등록합니다.
      'simple-import-sort': simpleImportSort
    },
    rules: {
      'simple-import-sort/imports': 'error', // <-- 3. import 정렬 규칙을 활성화합니다.
      '@typescript-eslint/no-unused-vars': 'error', // <-- 사용하지 않는 변수 규칙도 활성화합니다.

      // --- 기존에 끄고 있던 규칙들 ---
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