module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['sort-destructure-keys'],
  env: {
    es6: true,
    node: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:import/recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended',
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  rules: {
    'sort-destructure-keys/sort-destructure-keys': 'error',
    '@typescript-eslint/no-unused-vars': [
      'error',
      { varsIgnorePattern: 'unused' },
    ],
  },
};
