import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Les adaptateurs SQL manipulent des lignes non typées : toléré, mais pas dans le domaine.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true, argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/modules/*/domain/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      // Le domaine ne dépend d'aucun framework ni d'aucune infrastructure (architecture hexagonale).
      'no-restricted-imports': ['error', { patterns: ['@nestjs/*', 'pg', '**/infrastructure/**', '**/interface/**'] }],
    },
  },
);
