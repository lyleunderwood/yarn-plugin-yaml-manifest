# yarn-plugin-yaml-manifest

Yarn Berry plugin to use YAML manifest file.

# Installation

```
yarn plugin import https://raw.githubusercontent.com/lyleunderwood/yarn-plugin-yaml-manifest/master/bundles/%40yarnpkg/plugin-yaml-manifest.js
```

# Usage

Whenever yarn is run the manifest file (`package.json`) will be automatically overwritten
to reflect the contents of the YAML manifest file (`package.yml`).

After dependencies are modified (e.g. via `yarn add ...`) the YAML manifest file will be
patched to reflect the changes to the manifest file.
