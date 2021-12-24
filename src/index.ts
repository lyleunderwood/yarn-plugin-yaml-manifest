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
import globby from "globby";

export const DEFAULT_MANIFEST_FILE_NAME = "package.json" as Filename;
export const DEFAULT_YAML_MANIFEST_FILE_NAME = "package.yml" as Filename;

export const manifestFileName =
  (process.env.MANIFEST_FILE_NAME as Filename) || DEFAULT_MANIFEST_FILE_NAME;
export const yamlManifestFileName =
  (process.env.YAML_MANIFEST_FILE_NAME as Filename) ||
  DEFAULT_YAML_MANIFEST_FILE_NAME;

const isTruthy = <T>(thing: T | undefined): thing is T =>
  thing !== null && thing !== undefined;

/**
 * Update YAML manifest file to have the same effective contents as
 * JSON manifest file.
 *
 * If the YAML manifest file does not exist it will be created.
 */
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

  // if the contents would be unchanged, don't bother writing (mostly to preserve mtime)
  if (delta.length === 0) return;

  fs.writeFileSync(
    yamlManifestPath,
    YAMLDiffPatch.yamlPatch(yamlString, delta)
  );
};

/**
 * Update JSON manifest file to have the same effective contents as
 * YAML manifest file.
 *
 * If JSON manifest file does not exist it will be created.
 */
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

  // if the contents would be unchanged, don't bother writing (mostly to preserve mtime)
  if (delta.length === 0) return;

  const errors = applyPatch(jsonObject, delta); // mutates jsonObject
  if (errors?.length > 0) console.error(errors);
  fs.writeFileSync(manifestPath, JSON.stringify(jsonObject, null, 2));
};

/**
 * Prepares given directory for synchronization between YAML and JSON manifest files.
 *
 * If a JSON manifest does not exist but a YAML one does, creates JSON manifest from YAML.
 *
 * If a YAML manifest does not exist but a JSON one does, creates YAML manifest from JSON.
 *
 * Returns `undefined` if neither manifest file exists, or returns paths to both
 * manifest files if they do exist.
 */
export const normalizeDirectory = (dirPath: PortablePath) => {
  const manifestPath = path.join(dirPath, manifestFileName);
  const yamlManifestPath = path.join(dirPath, yamlManifestFileName);

  // if package.json doesn't exist
  if (!fs.existsSync(manifestPath)) {
    // if package.yml does exist
    if (fs.existsSync(yamlManifestPath)) {
      // write package.json from package.yml
      updateManifest({ manifestPath, yamlManifestPath });
    } else {
      // otherwise, skip this path
      return;
    }
  }

  // if package.yml doesn't exist
  if (!fs.existsSync(yamlManifestPath)) {
    // write it from package.json
    updateYaml({ manifestPath, yamlManifestPath });
    // and skip this path
    return;
  }

  return { manifestPath, yamlManifestPath };
};

/**
 * Callback invoked when a yarn command is run.
 *
 * Invoked before manifest file is first read by yarn.
 *
 * Calls `updateManifest` for each workspace directory.
 */
export const handleYarnStart = async ({ projectCwd }: Configuration) => {
  // because yarn has not yet read the manifest file there is no `Project` initialized,
  // and therefore we need to read a manifest ourselves and determine the relevant
  // workspace directories. we attempt to do this in the same way that yarn is doing it
  // internally.

  // bail if no project path, project must not be initialized
  if (projectCwd === null) return;

  const projectYamlManifestPath = path.join(
    projectCwd,
    yamlManifestFileName as Filename
  );

  const projectManifestPath = path.join(
    projectCwd,
    manifestFileName as Filename
  );

  // in theory the yaml file should be our source of truth generally
  const projectConfig = fs.existsSync(projectYamlManifestPath)
    ? YAML.parse(fs.readFileSync(projectYamlManifestPath).toString())
    : fs.existsSync(projectManifestPath)
    ? JSON.parse(fs.readFileSync(projectManifestPath).toString())
    : {};

  const patterns: string[] = projectConfig?.workspaces || [];

  // stolen from https://git.io/JyLqf
  const globPaths = globby.sync(patterns, {
    cwd: npath.fromPortablePath(projectCwd),
    expandDirectories: false,
    onlyDirectories: true,
    onlyFiles: false,
    ignore: [`**/node_modules`, `**/.git`, `**/.yarn`],
  });

  const workspacePaths = globPaths.map(npath.toPortablePath);

  // normalize and update manifests in all relevant directories
  [...workspacePaths, projectCwd]
    .map(normalizeDirectory)
    .filter(isTruthy)
    .forEach(updateManifest);
};

/**
 * Callback invoked after any yarn install operation has completed.
 *
 * Calls `updateYaml` for each workspace directory.
 */
export const handleDependenciesUpdated = ({ workspaces }: Project) => {
  // projectCwd is already considered a workspace apparently
  // normalize and update yaml in all relevant directories
  workspaces
    .map((workspace) => workspace.cwd)
    .map(normalizeDirectory)
    .filter(isTruthy)
    .forEach(updateYaml);
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
