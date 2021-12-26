import type { Config } from "@jest/types";
import { defaults } from "jest-config";

// Or async function
export default async (): Promise<Config.InitialOptions> => {
  return {
    verbose: true,
    moduleFileExtensions: [...defaults.moduleFileExtensions, "ts", "tsx"],
    testMatch: ["**/*.jest.ts"],
  };
};
