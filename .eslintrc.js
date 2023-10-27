module.exports = {
  root: true,
  plugins: ['prettier'],
  env: {
    es6: true,
    node: true,
  },
  extends: ['plugin:prettier/recommended'],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  rules: {
    'prettier/prettier': 'error',
  },
};
