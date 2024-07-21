const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const fs = require("fs");
const process = require("process");

let args = process.argv;
// let args = [
//   "F:\\Projects\\GitHub Repos\\SAMMI-Elgato-StreamDeck-Extension\\src\\solutions.sammi.sdPlugin\\main.exe",
//   "C:\\snapshot\\Users\\Landie\\AppData\\Roaming\\Elgato\\StreamDeck\\Plugins\\solutions.sammi.sdPlugin\\main.js",
//   "-port",
//   "28196",
//   "-pluginUUID",
//   "F3CD30F1CBC32CFDADA37A35B2A0C6E6",
//   "-registerEvent",
//   "registerPlugin",
//   "-info",
//   '{"application":{"font":"Segoe UI","language":"en","platform":"windows","platformVersion":"10.0.19045","version":"6.6.1.20596"},"colors":{"buttonMouseOverBackgroundColor":"#464646FF","buttonPressedBackgroundColor":"#303030FF","buttonPressedBorderColor":"#646464FF","buttonPressedTextColor":"#969696FF","highlightColor":"#0078FFFF"},"devicePixelRatio":1,"devices":[{"id":"27EFDAA54970B08A70ABE5F877AF0961","name":"Stream Deck","size":{"columns":5,"rows":3},"type":0}],"plugin":{"uuid":"solutions.sammi","version":"1.0.2"}}',
// ];

const elgatoData = parseArgs(args);

let server = null;
let wss = null;
let ws = null;
let wsElgato = null;
const RELAY_PORT = 9880;

//connect to generated elgato port over here!
wsElgato = new WebSocket("ws://127.0.0.1:" + elgatoData.port);

wsElgato.on("open", function open() {
  logger("connected to elgato server, registering...");
  registerElgatoPlugin();
  logger("attempted connection, should listen to events from elgato now!");
  logger("creating relay server...");
  createRelayServer();
  //openURL();
});

wsElgato.on("message", function incoming(data) {
  typeof data;
  logger("incoming: " + data);
  // fs.appendFileSync("output.txt", data, "utf-8");
  parseElgatoEvent(data);
});

wsElgato.on("close", function close() {
  logger("disconnected");
});

wsElgato.on("error", function error(err) {
  console.error("Error: ", err);
});

function createRelayServer() {
  try {
    server = http.createServer(express);
    wss = new WebSocket.Server({ server });
  } catch (err) {
    logger("Errored when starting server");
  }

  wss.on("connection", (ws, req) => {
    ws.on("message", msg => {
      logger(msg);
    });
    ws.on("close", (ws, req) => {
      logger("closed " + ws);
    });
  });

  try {
    server.listen(RELAY_PORT, () => {
      logger("server listening on port: " + RELAY_PORT);
    });
  } catch (e) {
    logger("error when listening");
  }
}

function sendToSAMMI(payload) {
  wss.clients.forEach(client => {
    client.send(JSON.stringify(payload));
  });
}

function parseElgatoEvent(e) {
  const data = JSON.parse(e);
  switch (data.event) {
    case "keyDown": //press
      if (!data.payload.settings.actionId) {
        sendToSAMMI({
          event: "error",
          msg: "An action was pressed, but contains no Action ID.",
        });
        return;
      }
      sendToSAMMI({
        event: "press",
        actionId: data.payload.settings.actionId,
      });
      break;
    case "keyUp": //release
      if (!data.payload.settings.actionId) {
        sendToSAMMI({
          event: "error",
          msg: "An action was released, but contains no Action ID.",
        });
        return;
      }
      sendToSAMMI({
        event: "release",
        actionId: data.payload.settings.actionId,
      });
      break;

    case "willAppear": // action visible
    // if (!data.settings.actionId) break;
    default:
      break;
  }
}

function registerElgatoPlugin() {
  const json = {
    event: elgatoData.registerEvent,
    uuid: elgatoData.pluginUUID,
  };

  wsElgato.send(JSON.stringify(json));
}

function openURL() {
  try {
    const json = {
      event: "openUrl",
      payload: {
        url: "https://landie.land",
      },
    };
    wsElgato.send(JSON.stringify(json));
  } catch (e) {
    logger(e);
  }
}

function parseArgs(args) {
  //trim off the first two args as they are not needed
  args = args.slice(2);
  const result = {};
  for (let i = 0; i < args.length; i++) {
    const argument = args[i];
    if (argument.startsWith("-")) {
      const key = argument.substring(1);
      result[key] = args[i + 1];
      i++;
    }
  }
  //extra parsing
  result.info = JSON.parse(result.info);
  result.port = Number(result.port);
  return result;
}

function logger(msg) {
  fs.appendFileSync("output.txt", msg + "\n", "utf-8");
}

async function wait(ms) {
  return new Promise(() => {
    setTimeout(() => {
      Promise.resolve();
    }, ms);
  });
}
