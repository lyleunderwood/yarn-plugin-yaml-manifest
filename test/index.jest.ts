import { spawn } from "child_process";
import * as path from "path";
import * as fs from "fs";

const testDir = __dirname;
const projectDir = path.join(testDir, "/../");
const sandboxDir = path.join(testDir, "/sandbox");

const run = (command: string, cwd: string) => {
  return new Promise((resolve, reject) => {
    const proc = spawn("/usr/bin/env", command.split(" "), {
      stdio: "inherit",
      cwd,
    });
    proc.on("error", reject);
    proc.on("exit", (signal) => {
      if (signal !== 0) {
        return reject(signal);
      }

      resolve(0);
    });
  });
};

const resetDir = async (dir: string) => {
  await run("git clean -f -d " + dir, projectDir);
  await run("git checkout " + dir, projectDir);
};

const prepareDir = async (dir: string) => {
  await run(
    "yarn plugin import " +
      path.join(projectDir, "/bundles/@yarnpkg/plugin-yaml-manifest.js"),
    dir
  );
};

beforeAll(async () => {
  await run("rm package.json", projectDir);
  await run("rm yarn.lock", projectDir);
  await resetDir(sandboxDir);
});

afterAll(async () => {
  await resetDir(sandboxDir);
});

describe("yarn-plugin-yaml-manifest", () => {
  describe("package with no existing package.yml", () => {
    const dir = path.join(sandboxDir, "fresh");

    beforeEach(async () => {
      await prepareDir(dir);
    });

    describe("yarn install", () => {
      it("should create the package.yml from the package.json", async () => {
        await run("yarn install", dir);
        expect(fs.readFileSync(path.join(dir + "/package.yml")).toString())
          .toMatchInlineSnapshot(`
          "{ name: fresh, packageManager: yarn@3.1.1 }
          "
        `);
      });
    });

    describe("yarn add lodash", () => {
      it("should create the package.yml from the package.json", async () => {
        await run("yarn add lodash", dir);
        expect(fs.readFileSync(path.join(dir + "/package.yml")).toString())
          .toMatchInlineSnapshot(`
          "{
            name: fresh,
            packageManager: yarn@3.1.1,
            dependencies: { lodash: ^4.17.21 }
          }
          "
        `);
      });

      it("should add the lodash dep to package.json", async () => {
        await run("yarn add lodash", dir);
        expect(fs.readFileSync(path.join(dir + "/package.json")).toString())
          .toMatchInlineSnapshot(`
          "{
            \\"name\\": \\"fresh\\",
            \\"packageManager\\": \\"yarn@3.1.1\\",
            \\"dependencies\\": {
              \\"lodash\\": \\"^4.17.21\\"
            }
          }
          "
        `);
      });
    });
  });

  describe("package with multiple workspaces", () => {
    const dir = path.join(sandboxDir, "/workspaces");

    beforeAll(async () => {
      await prepareDir(dir);
    });

    beforeEach(async () => {
      await resetDir(dir);
    });

    describe("yarn add lodash in project root", () => {
      it("should add the dep to package.json", async () => {
        await run("yarn add lodash", dir);
        expect(fs.readFileSync(path.join(dir + "/package.json")).toString())
          .toMatchInlineSnapshot(`
          "{
            \\"name\\": \\"workspace-test\\",
            \\"packageManager\\": \\"yarn@3.1.1\\",
            \\"private\\": true,
            \\"workspaces\\": [
              \\"packages/*\\"
            ],
            \\"dependencies\\": {
              \\"@yarnpkg/core\\": \\"^3.2.0-rc.8\\",
              \\"lodash\\": \\"^4.17.21\\"
            }
          }
          "
        `);
      });

      it("should add the dep to package.yml", async () => {
        await run("yarn add lodash", dir);
        expect(fs.readFileSync(path.join(dir + "/package.yml")).toString())
          .toMatchInlineSnapshot(`
          "name: workspace-test
          packageManager: yarn@3.1.1
          private: true
          workspaces:
            - packages/*
          dependencies:
            \\"@yarnpkg/core\\": ^3.2.0-rc.8
            lodash: ^4.17.21
          "
        `);
      });
    });

    describe("yarn add lodash in package a", () => {
      it("should add the dep to package.json", async () => {
        await run("yarn add lodash", path.join(dir, "/packages/a"));
        expect(
          fs
            .readFileSync(path.join(dir + "/packages/a/package.json"))
            .toString()
        ).toMatchInlineSnapshot(`
          "{
            \\"name\\": \\"a\\",
            \\"packageManager\\": \\"yarn@3.1.1\\",
            \\"dependencies\\": {
              \\"debounce\\": \\"^1.2.1\\",
              \\"lodash\\": \\"^4.17.21\\"
            }
          }
          "
        `);
      });

      it("should add the dep to package.yml", async () => {
        await run("yarn add lodash", path.join(dir, "/packages/a"));
        expect(
          fs.readFileSync(path.join(dir + "/packages/a/package.yml")).toString()
        ).toMatchInlineSnapshot(`
          "name: a
          packageManager: yarn@3.1.1
          dependencies:
            debounce: ^1.2.1
            lodash: ^4.17.21
          "
        `);
      });
    });
  });
});
