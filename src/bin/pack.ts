#!/usr/bin/env node
import { updateYaml, updateManifest } from "../";
import { spawn } from "child_process";

const [_node, _file, ...args] = process.argv;

spawn(`/usr/bin/env`, ["yarn", ...args], { stdio: "inherit" });
