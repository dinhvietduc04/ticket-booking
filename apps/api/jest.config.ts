import type { Config } from "jest";

const config: Config = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: ".",
  testEnvironment: "node",
  testRegex: ".*\\.spec\\.ts$",
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        tsconfig: "tsconfig.json",
      },
    ],
  },
};

export default config;
