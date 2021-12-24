import {
  Filename,
  PortablePath,
  ppath as path,
  xfs as fs,
  npath,
} from "@yarnpkg/fslib";
import * as YAML from "yaml";
import * as YAMLDiffPatch from "yaml-diff-patch";
import { createPatch, applyPatch } from "rfc6902";
import type { Hooks, Plugin, Configuration, Project } from "@yarnpkg/core";
import { globbySync } from "globby";

export const DEFAULT_MANIFEST_FILE_NAME = "package.json" as Filename;
export const DEFAULT_YAML_MANIFEST_FILE_NAME = "package.yml" as Filename;

export const manifestFileName =
  (process.env.MANIFEST_FILE_NAME as Filename) || DEFAULT_MANIFEST_FILE_NAME;
export const yamlManifestFileName =
  (process.env.YAML_MANIFEST_FILE_NAME as Filename) ||
  DEFAULT_YAML_MANIFEST_FILE_NAME;

export const updateYaml = ({
  manifestPath,
  yamlManifestPath,
}: {
  manifestPath: PortablePath;
  yamlManifestPath: PortablePath;
}) => {
  const yamlString = fs.existsSync(yamlManifestPath)
    ? fs.readFileSync(yamlManifestPath).toString()
    : "{}";

  const jsonObject = JSON.parse(fs.readFileSync(manifestPath).toString());
  const yamlObject = YAML.parse(yamlString);

  const delta = createPatch(yamlObject, jsonObject);
  console.log(delta);

  // if the contents would be unchanged, don't bother writing (mostly to preserve mtime)
  if (delta.length === 0) return;

  fs.writeFileSync(
    yamlManifestPath,
    YAMLDiffPatch.yamlPatch(yamlString, delta)
  );
};

export const updateManifest = ({
  manifestPath,
  yamlManifestPath,
}: {
  manifestPath: PortablePath;
  yamlManifestPath: PortablePath;
}) => {
  const yamlObject = YAML.parse(fs.readFileSync(yamlManifestPath).toString());
  const jsonObject = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath).toString())
    : {};

  const delta = createPatch(jsonObject, yamlObject);
  console.log(delta);

  // if the contents would be unchanged, don't bother writing (mostly to preserve mtime)
  if (delta.length === 0) return;

  const errors = applyPatch(jsonObject, delta); // mutates jsonObject
  if (errors?.length > 0) console.error(errors);
  fs.writeFileSync(manifestPath, JSON.stringify(jsonObject, null, 2));
};

export const handleYarnStart = async (configuration: Configuration) => {
  // get project path
  const projectPath = configuration.projectCwd;
  // bail if no project path, project must not be initialized
  if (projectPath === null) return;
  // get project yaml file
  const projectYamlManifestPath = path.join(
    projectPath,
    yamlManifestFileName as Filename
  );
  const projectManifestPath = path.join(
    projectPath,
    manifestFileName as Filename
  );

  const projectConfig = fs.existsSync(projectYamlManifestPath)
    ? YAML.parse(fs.readFileSync(projectYamlManifestPath).toString())
    : fs.existsSync(projectManifestPath)
    ? JSON.parse(fs.readFileSync(projectManifestPath).toString())
    : {};

  // get all workspace paths
  const patterns: string[] = projectConfig?.workspaces || [];

  // stolen from https://git.io/JyLqf
  const workspacePaths = globbySync(patterns, {
    cwd: npath.fromPortablePath(projectPath),
    expandDirectories: false,
    onlyDirectories: true,
    onlyFiles: false,
    ignore: [`**/node_modules`, `**/.git`, `**/.yarn`],
  }).map(npath.toPortablePath);

  // for each workspace path and project path
  [...workspacePaths, projectPath].forEach((workspacePath) => {
    const manifestPath = path.join(workspacePath, manifestFileName);
    const yamlManifestPath = path.join(workspacePath, yamlManifestFileName);

    // if package.json doesn't exist
    if (!fs.existsSync(manifestPath)) {
      // if package.yml does exist
      if (fs.existsSync(yamlManifestPath)) {
        // write package.json from package.yml
        updateManifest({ manifestPath, yamlManifestPath: yamlManifestPath });
      } else {
        // otherwise, skip this path
        return;
      }
    }

    // if package.yml doesn't exist
    if (!fs.existsSync(yamlManifestPath)) {
      // write it from package.json
      updateYaml({ manifestPath, yamlManifestPath: yamlManifestPath });
      // and skip this path
      return;
    }

    // update package.json from package.yml for this path
    updateManifest({ manifestPath, yamlManifestPath: yamlManifestPath });
  });
};

export const handleDependenciesUpdated = ({
  workspaces,
  configuration,
}: Project) => {
  // get project path
  const projectPath = configuration.projectCwd;
  // bail if no project path, project must not be initialized
  if (projectPath === null) return;

  const workspacePaths = workspaces.map((workspace) => workspace.cwd);

  // project path is already considered a workspace apparently
  [...workspacePaths].forEach((workspacePath) => {
    const manifestPath = path.join(workspacePath, manifestFileName);
    const yamlManifestPath = path.join(workspacePath, yamlManifestFileName);

    // if package.json doesn't exist
    if (!fs.existsSync(manifestPath)) {
      // if package.yml does exist
      if (fs.existsSync(yamlManifestPath)) {
        // write package.json from package.yml
        updateManifest({ manifestPath, yamlManifestPath: yamlManifestPath });
      } else {
        // otherwise, skip this path
        return;
      }
    }

    // if package.yml doesn't exist
    if (!fs.existsSync(yamlManifestPath)) {
      // write it from package.json
      updateYaml({ manifestPath, yamlManifestPath: yamlManifestPath });
      // and skip this path
      return;
    }

    // update package.yml from package.json for this path
    updateYaml({ manifestPath, yamlManifestPath: yamlManifestPath });
  });
};

let yarnStarted = false;

const plugin: Plugin<Hooks> = {
  hooks: {
    // HACK: We need a way to write the manifest before yarn can read it, and the
    // only way I could find to do this was this hook. It gets called multiple times,
    // but we only want our action to happen once. Seems to be called before most
    // significant yarn actions, including adds, installs, scripts, etc.
    registerPackageExtensions: (configuration) => {
      if (yarnStarted) return Promise.resolve();

      yarnStarted = true;

      return handleYarnStart(configuration);
    },
    afterAllInstalled: (project) => {
      handleDependenciesUpdated(project);
    },
  },
  commands: [],
};

export default plugin;
