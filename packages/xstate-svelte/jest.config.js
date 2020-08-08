const { jest: lernaAliases } = require('lerna-alias');

module.exports = {
  moduleNameMapper: lernaAliases(),
  transform: {
    '^.+\\.svelte$': [
      'svelte-jester',
      {
        preprocess: true
      }
    ],
    '^.+\\.ts$': 'ts-jest'
  }
};
