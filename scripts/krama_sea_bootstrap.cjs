const Module = require("module");
const path = require("path");
const sea = require("node:sea");

if (!sea.isSea()) {
  throw new Error("This bootstrap is intended to run inside a SEA executable.");
}

process.env.KRAMA_RUNNING_AS_EXE = "1";
process.env.KRAMA_APP_ROOT = path.dirname(process.execPath);

const source = sea.getAsset("scrape_krama.js", "utf8");
const filename = path.join(process.env.KRAMA_APP_ROOT, "embedded", "scrape_krama.js");
const embeddedModule = new Module(filename, module.parent);
embeddedModule.filename = filename;
embeddedModule.paths = Module._nodeModulePaths(process.env.KRAMA_APP_ROOT);
embeddedModule._compile(source, filename);
