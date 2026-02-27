#!/usr/bin/env node

import './cli/env.js';
import { createProgram } from './cli/program.js';

const program = createProgram();
program.parse();

if (!process.argv.slice(2).length) {
  program.help();
}
