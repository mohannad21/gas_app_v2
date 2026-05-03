module.exports = {
  preset: "jest-expo",
  roots: ["<rootDir>/../tests/frontend"],
  moduleDirectories: ["node_modules", "<rootDir>/node_modules"],
  setupFiles: ["<rootDir>/../tests/frontend/test/jest.setup.js"],
  setupFilesAfterEnv: ["@testing-library/jest-native/extend-expect"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  transformIgnorePatterns: [
    "node_modules/(?!(react-native|@react-native|expo|@expo|expo-router|expo-secure-store|@react-navigation|@tanstack|expo-modules-core)/)",
  ],
};

