#!/usr/bin/env node
import { Command } from "commander";
import { findPackage } from "../package-info.js";

const pkg = findPackage();

const program = new Command()
  .name("dibujo")
  .description("A digital companion to your Bullet Journal.")
  .version(pkg.version, "-v, --version", "print the version");

await program.parseAsync(process.argv);
