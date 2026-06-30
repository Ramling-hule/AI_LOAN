module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true,
  },
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  extends: ['eslint:recommended', 'plugin:import/recommended'],
  plugins: ['import'],
  rules: {
    
    'no-console': 'warn',
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],

    
    eqeqeq: ['error', 'always'],
    curly: 'error',
    'no-var': 'error',
    'prefer-const': 'error',

    
    'import/order': [
      'warn',
      {
        groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
        'newlines-between': 'always',
      },
    ],
  },
  ignorePatterns: ['node_modules/', 'dist/', 'build/', '.cache/'],
};
