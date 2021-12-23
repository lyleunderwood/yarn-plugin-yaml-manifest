import * as fs from "fs";
import * as YAML from "yaml";
import * as YAMLDiffPatch from "yaml-diff-patch";
import { createPatch, Operation } from "rfc6902";
import type { Hooks, Plugin, CommandContext } from "@yarnpkg/core";
import { Command, Usage } from "clipanion";

export const DEFAULT_MANIFEST_PATH = "./package.json";
export const DEFAULT_YAML_PATH = "./package.yml";

export const manifestPath = process.env.MANIFEST_PATH || DEFAULT_MANIFEST_PATH;
export const yamlManifestPath =
  process.env.YAML_MANIFEST_PATH || DEFAULT_YAML_PATH;

export const manifestContents = (
  path: string = DEFAULT_MANIFEST_PATH
): string => (fs.existsSync(path) ? fs.readFileSync(path).toString() : "{}");

export const yamlContents = (path: string = DEFAULT_YAML_PATH) =>
  fs.existsSync(path) ? fs.readFileSync(path).toString() : "{}";

export const writeYaml = (
  contents: string,
  path: string = DEFAULT_YAML_PATH
) => {
  fs.writeFileSync(path, contents);
};

export const writeManifest = (
  contents: string,
  path: string = DEFAULT_MANIFEST_PATH
) => {
  fs.writeFileSync(path, contents);
};

export const yamlAsJS = (yaml: string) => {
  return YAML.parse(yaml);
};

export const jsonDiff = ({ from, to }: { from: unknown; to: unknown }) => {
  return createPatch(from, to);
};

export const patchedYaml = (yaml: string, patch: Operation[]) => {
  return YAMLDiffPatch.yamlPatch(yaml, patch);
};

export const updateYaml = (
  {
    manifestPath = DEFAULT_MANIFEST_PATH,
    yamlPath = DEFAULT_YAML_PATH,
  }: { manifestPath: string; yamlPath: string } = {
    manifestPath: DEFAULT_MANIFEST_PATH,
    yamlPath: DEFAULT_YAML_PATH,
  }
) => {
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`${manifestPath} doesn't exist!`);
  }

  if (!fs.existsSync(yamlPath)) {
    process.stderr.write(
      `${yamlPath} doesn't exist, so we're going to create it from ${manifestPath}.\n`
    );
    writeYaml(
      YAML.stringify(JSON.parse(manifestContents(manifestPath))),
      yamlPath
    );
    return;
  }

  const yaml = yamlContents(yamlPath);

  const patch = jsonDiff({
    to: JSON.parse(manifestContents(manifestPath)),
    from: yamlAsJS(yaml),
  });

  // if the patch doesn't do anything, don't bother writing (and preserve mtime)
  if (patch.length === 0) return;

  writeYaml(patchedYaml(yaml, patch));
};

export const updateManifest = (
  {
    manifestPath = DEFAULT_MANIFEST_PATH,
    yamlPath = DEFAULT_YAML_PATH,
  }: { manifestPath: string; yamlPath: string } = {
    manifestPath: DEFAULT_MANIFEST_PATH,
    yamlPath: DEFAULT_YAML_PATH,
  }
) => {
  if (!fs.existsSync(manifestPath)) {
    process.stderr.write(
      `${manifestPath} doesn't exist so we're going to create it from ${yamlPath}.\n`
    );

    const yamlJson = JSON.stringify(
      YAML.parse(yamlContents(yamlPath)),
      null,
      2
    );

    // if the contents would be unchanged, don't bother writing (mostly to preserve mtime)
    if (yamlJson === manifestContents(manifestPath)) return;

    writeManifest(yamlJson, manifestPath);
    return;
  }

  if (!fs.existsSync(yamlPath)) {
    process.stderr.write(
      `${yamlPath} doesn't exist, so we're going to create it from ${manifestPath}.\n`
    );
    writeYaml(
      YAML.stringify(JSON.parse(manifestContents(manifestPath))),
      yamlPath
    );
    return;
  }

  writeManifest(
    JSON.stringify(yamlAsJS(yamlContents(yamlPath)), null, 2),
    manifestPath
  );
};

class UpdateManifestFromYaml extends Command<CommandContext> {
  static paths = [["update-manifest-from-yaml"]];

  static usage: Usage = Command.Usage({
    description:
      "Write manifest file to reflect contents of YAML manifest file.",
  });

  async execute() {
    return Promise.resolve(
      updateManifest({ manifestPath, yamlPath: yamlManifestPath })
    );
  }
}

class UpdateYamlFromManifest extends Command<CommandContext> {
  static paths = [["update-yaml-from-manifest"]];

  static usage: Usage = Command.Usage({
    description:
      "Patch YAML manifest file from real manifest file, attempting to preserve whitespace.",
  });

  async execute() {
    return Promise.resolve(
      updateYaml({ manifestPath, yamlPath: yamlManifestPath })
    );
  }
}

export const handleYarnStart = () => {
  updateManifest({ manifestPath, yamlPath: yamlManifestPath });
};

export const handleDependenciesUpdated = () => {
  updateYaml({ manifestPath, yamlPath: yamlManifestPath });
};

let yarnStarted = false;

const plugin: Plugin<Hooks> = {
  hooks: {
    // HACK: We need a way to write the manifest before yarn can read it, and the
    // only way I could find to do this was this hook. It gets called multiple times,
    // but we only want our action to happen once. Seems to be called before most
    // significant yarn actions, including adds, installs, scripts, etc.
    registerPackageExtensions: () => {
      if (yarnStarted) return Promise.resolve();

      yarnStarted = true;

      handleYarnStart();
      return Promise.resolve();
    },
    afterAllInstalled: () => {
      handleDependenciesUpdated();
    },
  },
  commands: [UpdateManifestFromYaml, UpdateYamlFromManifest],
};

export default plugin;
