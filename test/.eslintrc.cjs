module.exports = {
  extends: ['../.eslintrc.cjs', 'plugin:chai-expect/recommended'],
  env: {
    mocha: true,
  },
  globals: {
    chai: 'readonly',
    expect: 'readonly',
    sinon: 'readonly',
  },
};
