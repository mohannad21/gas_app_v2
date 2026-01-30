module.exports = {
  preset: "jest-expo",
  roots: ["<rootDir>/../tests/frontend"],
  setupFiles: ["<rootDir>/../tests/frontend/test/jest.setup.js"],
  setupFilesAfterEnv: ["@testing-library/jest-native/extend-expect"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  transformIgnorePatterns: [
    "node_modules/(?!(react-native|@react-native|expo|@expo|expo-router|@react-navigation|@tanstack|expo-modules-core)/)",
  ],
};
