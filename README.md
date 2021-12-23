# yarn-plugin-yaml-manifest

Yarn Berry plugin to use YAML manifest file.

Have you ever wished you could add comments and whitespace to your `package.json` file?
Rearrange it even? You can with [YAML](https://yaml.org/). See the
[`package.yml`](https://github.com/lyleunderwood/yarn-plugin-yaml-manifest/blob/master/package.yml)
in this repo as an example.

# Installation

```
yarn plugin import https://raw.githubusercontent.com/lyleunderwood/yarn-plugin-yaml-manifest/master/bundles/%40yarnpkg/plugin-yaml-manifest.js
```

# Usage

Whenever yarn is run the manifest file (`package.json`) will be automatically overwritten
to reflect the contents of the YAML manifest file (`package.yml`).

After dependencies are modified (e.g. via `yarn add ...`) the YAML manifest file will be
patched to reflect the changes to the manifest file.
