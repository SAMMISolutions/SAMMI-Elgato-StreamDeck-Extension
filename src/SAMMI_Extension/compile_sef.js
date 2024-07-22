const path = require("path");
const fs = require("fs").promises;
const process = require("process");

const fetchManifest = async () => {
  const res = await fs.readFile(
    path.join(__dirname, "ext_manifest.json"),
    "utf-8"
  );
  return JSON.parse(res);
};
const fetchExternal = async () => {
  return await fs.readFile(
    path.join(__dirname, "bridge_external.html"),
    "utf-8"
  );
};
const fetchCommands = async () => {
  return await fs.readFile(path.join(__dirname, "sammi_commands.js"), "utf-8");
};
const fetchHooks = async () => {
  return await fs.readFile(path.join(__dirname, "sammi_hooks.js"), "utf-8");
};
const fetchScript = async () => {
  return await fs.readFile(path.join(__dirname, "sammi_script.js"), "utf-8");
};

const compileOver = async config => {
  try {
    const deckRaw = await fs.readFile(
      path.join(__dirname, "deck_data.txt"),
      "utf-8"
    );
    const deck = JSON.parse(deckRaw);
    const compiledDeck = { ...deck, ...config };
    return JSON.stringify(compiledDeck);
  } catch (e) {
    return ''
  }
};

const main = async () => {
  const manifest = await fetchManifest();
  const [external, commands, hooks, script, overData] = await Promise.all([
    fetchExternal(),
    fetchCommands(),
    fetchHooks(),
    fetchScript(),
    compileOver(manifest.deck_config),
  ]);

  let SammiExtension = `[extension_name]
${manifest.name}

[extension_info]
${manifest.info}

[extension_version]
${manifest.version}

[insert_external]
${external}

[insert_command]
${commands}

[insert_hook]
${hooks}

[insert_script]
${script}

[insert_over]
${overData}`;
  await fs.writeFile("compiled.sef", SammiExtension, { encoding: "utf8" });
};

main();
