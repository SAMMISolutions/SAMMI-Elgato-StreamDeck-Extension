const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const fs = require("fs");
const fsP = require("fs").promises;
const process = require("process");
const path = require("path");
const axios = require("axios");

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
let debug = true; //shows logging
// let collection = {
//   device_27EFDAA54970B08A70ABE5F877AF0961: {
//     actions: {
//       ctx_83f85e559e1f9551221e8a2d813e7b1e: {
//         title: "this is a title",
//         img: "https://landie.land/pfp.png"
//       },
//       ctx_00c3b449d095f03b08c05fdded800943: {
//         title: "this is another title",
//         img: "https://landie.land/ref.png"
//       },
//     },
//   },
// };

let collection = {};
let collectionQueue = {
  //id_wudgawd0819d: {title: 'cool title', actionId: "wudgawd0819d"}
};

const RELAY_PORT = 9880;
const ERROR_IMG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAC+SURBVDhPtZHBCYQwEEXNQhQhTQi2YQn2YQM2YEd6C3qQKHiIDeSagwcPVqC4wf0sLiTisuy7zLxJBn6I9y0E9USapnEcU0qVUmVZYupiGIZ93/u+H8fRNEII3/dxZqVpmveNPM/NTlEUL72F1ppzDjl4oDpY13XbNsjB1UKWZVEUdV0Hv8DkruvaPKCqKoyukVK2bZskCfyEM9I0TdYwzoVlWdD9hXmezU9DPrFHIoQEQQC5A2MsDEPIT3jeEz5sR4t16Fp9AAAAAElFTkSuQmCC";

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
  parseEvent(data, "Elgato");
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
    const fetchSource = url => {
      // if (url === "/pi") return "PI";
      if (url === "/sammi-bridge") return "SAMMI";
      logger("unknown source url: " + url);
      return null;
    };

    ws.on("message", msg => {
      //* this is when a connected client (such as PI or SAMMI) sends something to the plugin server
      let source = fetchSource(req.url);
      if (source === null) return;
      parseEvent(msg, source);
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
  logger("sending a payload to sammi. here: " + JSON.stringify(payload));
  if (payload.event === "error") {
    showAlert(payload.context);
  }
  wss.clients.forEach(client => {
    client.send(JSON.stringify(payload));
  });
}

function parseEvent(e, source) {
  const data = JSON.parse(e);
  logger("event: " + data.event);
  logger("source: " + source);
  switch (data.event) {
    case "deviceDidConnect":
      logger("a device connected");
      collectionNewDevice(data.device, data.deviceInfo);
      break;
    case "SAMMIUpdateAction":
      logger("event from SAMMI, update action!");
      SAMMIUpdateAction(data.actionId, data.payload);
      break;
    case "setIcon":
      logger("trying to set icon from elgato");
      setIcon(data.device, data.context, data.icon, true, source);
      break;
    case "setTitle":
      logger("trying to set title!");
      setTitle(data.device, data.context, data.title, true);
      break;
    case "sendToPlugin": //from PI to plugin
      logger("custom event from PI");
      parsePiEvent(data.payload.event, data.payload);
      break;
    case "keyDown": //press
      if (!data.payload.settings.actionId) {
        sendToSAMMI({
          event: "error",
          msg: "An action was pressed, but contains no Action ID.",
          context: data.context,
        });
        return;
      }
      sendToSAMMI({
        event: "pressed",
        title:
          collection[`device_${data.device}`].actions[`ctx_${data.context}`]
            .title,
        actionId: data.payload.settings.actionId,
        state:
          collection[`device_${data.device}`].actions[`ctx_${data.context}`]
            .state,
      });
      break;
    case "keyUp": //release
      if (!data.payload.settings.actionId) {
        sendToSAMMI({
          event: "error",
          msg: "An action was released, but contains no Action ID.",
          context: data.context,
        });
        return;
      }
      sendToSAMMI({
        event: "released",
        title:
          collection[`device_${data.device}`].actions[`ctx_${data.context}`]
            .title,
        actionId: data.payload.settings.actionId,
        state:
          collection[`device_${data.device}`].actions[`ctx_${data.context}`]
            .state,
      });
      break;
    case "willAppear": // action visible
      // const collectionActionSettings =
      //   collection[`device_${data.device}`].actions[`ctx_${data.context}`];
      logger("an action appeared! do some stuff");
      if (Object.keys(data.payload.settings).length === 0) {
        logger("this was a freshly created action, do nothing yet");
        return;
      }
      // collectionUpdateDeviceAction(
      //   data.device,
      //   data.context,
      //   data.payload.settings,

      // );
      //check queue for matching id

      // if (typeof collectionQueue[`id_${data.payload.settings?.actionId}`] === 'object') {
      //   const queuedPayload = collectionQueue[`id_${data.payload.settings.actionId}`]
      //   collectionUpdateDeviceAction(data.device, data.context, queuedPayload)
      //   delete collectionQueue[`id_${data.payload.settings.actionId}`]
      // } else {
      // }

      //always update
      collectionUpdateDeviceAction(data.device, data.context, {
        actionId: data.payload.settings.actionId,
      });

      //state
      if (
        !collection[`device_${data.device}`].actions[`ctx_${data.context}`]
          ?.state
      ) {
        setState(data.device, data.context, data.payload.settings.state, true);
      } else {
        setState(
          data.device,
          data.context,
          collection[`device_${data.device}`].actions[`ctx_${data.context}`]
            .state,
          false
        );
      }
      //title
      if (
        !collection[`device_${data.device}`].actions[`ctx_${data.context}`]
          ?.title
      ) {
        setTitle(data.device, data.context, data.payload.settings.title, true);
      } else {
        setTitle(
          data.device,
          data.context,
          collection[`device_${data.device}`].actions[`ctx_${data.context}`]
            .title,
          false
        );
      }

      //icon
      if (
        !collection[`device_${data.device}`].actions[`ctx_${data.context}`]
          ?.icon
      ) {
        setIcon(
          data.device,
          data.context,
          data.payload.settings.icon,
          true,
          "Elgato"
        );
      } else {
        setIcon(
          data.device,
          data.context,
          collection[`device_${data.device}`].actions[`ctx_${data.context}`]
            .icon,
          false,
          "Elgato"
        );
      }

      break;
    default:
      break;
  }
}

function parsePiEvent(piEvent, data) {
  switch (piEvent) {
    case "freshActionId":
      logger("oh, fresh ID! " + data.actionId);
      collectionUpdateDeviceAction(data.device, data.context, {
        actionId: data.actionId,
      });
      break;
    case "setState":
      setState(data.device, data.context, data.icon, true, "PI");
      break;
    case "setTitle":
      setTitle(data.device, data.context, data.title, true);
      break;
    case "setIcon":
      setIcon(data.device, data.context, data.icon, true, "PI");
      break;
    default:
      break;
  }
}

function SAMMIUpdateAction(actionId, sammiPayload) {
  const actionInfo = fetchActionInfoFromActionId(actionId);
  if (actionInfo === null) {
    logger(
      "WARN: SAMMI Update Action failed because it could not find actionInfo from actionID " +
        actionId
    );
    logger("WARN: Queueing actionID");
    collectionQueue[`id_${actionId}`] = sammiPayload;
    collectionQueue[`id_${actionId}`].actionId = actionId;
    logger("echoed queue: " + JSON.stringify(collectionQueue));
    return;
  }
  const collectionActionSettings =
    collection[`device_${actionInfo.device}`].actions[
      `ctx_${actionInfo.context}`
    ];

  if (sammiPayload.title !== null) {
    if (actionInfo !== null) {
      setTitle(actionInfo.device, actionInfo.context, sammiPayload.title, true);
    } else {
      collectionQueue[`id_${actionId}`].title = sammiPayload.title;
    }
  }
  if (sammiPayload.icon !== null) {
    if (actionInfo !== null) {
      setIcon(
        actionInfo.device,
        actionInfo.context,
        sammiPayload.icon,
        true,
        "SAMMI"
      );
    } else {
      // parseIcon(sammiPayload.icon).then(parsedIcon => {
      //   collectionQueue[`id_${actionId}`].icon = parsedIcon;
      // });
      collectionQueue[`id_${actionId}`].icon = icon;
    }
  }
}

function registerElgatoPlugin() {
  sendToElgatoWs({
    event: elgatoData.registerEvent,
    uuid: elgatoData.pluginUUID,
  });
}
function fetchContextFromActionId(actionId) {
  
}

function fetchActionInfoFromActionId(actionId) {
  for (let deviceKey in collection) {
    let actions = collection[deviceKey].actions;
    for (let contextKey in actions) {
      if (actions[contextKey].actionId === actionId) {
        return {
          device: deviceKey.replace("device_", ""),
          context: contextKey.replace("ctx_", ""),
        };
      }
    }
  }
  return null;
}

function collectionUpdateDeviceAction(device, ctx, actionSettings) {
  if (!device || !ctx) {
    logger("ERR: no device or info was provided, exiting");
    return;
  }
  logger(
    `collectionUpdateDeviceAction recieved parameters: ${device}, ${ctx}, ${actionSettings}`
  );

  if (
    typeof collection[`device_${device}`].actions[`ctx_${ctx}`] !== "object"
  ) {
    logger("first time action in collection, adding new");
    collection[`device_${device}`].actions[`ctx_${ctx}`] = {};
  }

  //queue check
  logger(
    'checking to see if the action id "' +
      actionSettings.actionId +
      '" provided exists in queue'
  );
  logger(
    "checking queue: " + typeof collectionQueue[`id_${actionSettings.actionId}`]
  );
  if (typeof collectionQueue[`id_${actionSettings.actionId}`] === "object") {
    logger("wow, it does! grab settings and merge, then remove");
    actionSettings = {
      ...actionSettings,
      ...collectionQueue[`id_${actionSettings.actionId}`],
    };
    delete collectionQueue[`id_${actionSettings.actionId}`];
  }

  for (const property in actionSettings) {
    if (actionSettings[property] !== null) {
      collection[`device_${device}`].actions[`ctx_${ctx}`][property] =
        actionSettings[property];
    }
  }

  logger("successfully added new device to collection, echoing");
  logger(JSON.stringify(collection));
}

function collectionNewDevice(device, info) {
  if (!device || !info) {
    logger("ERR: no device or info was provided, exiting");
    return;
  }
  logger(`collectionNewDevice recieved parameters: ${device}, ${info}`);

  collection[`device_${device}`] = {};
  collection[`device_${device}`].actions = {};
  collection[`device_${device}`].info = info;

  logger("successfully added new device to collection, echoing");
  logger(JSON.stringify(collection));
}

function sendToElgatoWs(json) {
  try {
    wsElgato.send(JSON.stringify(json));
  } catch (e) {
    logger(e);
  }
}

function showAlert(context) {
  sendToElgatoWs({
    event: "showAlert",
    context: context,
  });
}

async function setIcon(device, context, icon, update, source) {
  const parsedIcon = await parseIcon(icon);
  if (parsedIcon === ERROR_IMG) {
    const errMsg = "Provided icon path was invalid.";
    logger(`ERR: ${errMsg}`);
    if (source === "SAMMI") {
      sendToSAMMI({
        event: "error",
        msg: "Provided icon path was invalid.",
      });
    }
  }

  if (update) {
    collectionUpdateDeviceAction(device, context, { icon: icon });
  }

  sendToElgatoWs({
    event: "setImage",
    context: context,
    payload: {
      image: parsedIcon,
    },
  });
}

async function setState(device, context, state, update) {
  if (update) {
    collectionUpdateDeviceAction(device, context, { state: state });
  }
}
async function setTitle(device, context, title, update) {
  if (update) {
    collectionUpdateDeviceAction(device, context, { title: title });
  }
  sendToElgatoWs({
    event: "setTitle",
    context: context,
    payload: {
      title: title,
    },
  });
}

function openURL() {
  sendToElgatoWs({
    event: "openUrl",
    payload: {
      url: "https://landie.land",
    },
  });
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
  if (!debug) return;
  fs.appendFileSync("output.txt", msg + "\n", "utf-8");
}

async function wait(ms) {
  return new Promise(() => {
    setTimeout(() => {
      Promise.resolve();
    }, ms);
  });
}

async function parseIcon(icon) {
  const type = determineImageType(icon);
  let b64Uri = null;
  switch (type) {
    case "url":
      b64Uri = await urlImgToBase64(icon);
      break;
    case "local":
      b64Uri = await pathToBase64(icon);
      break;
    case "base64":
      //! there is something wrong with this. This would be great to have to cache images for faster loading in collection.
      // const VALID_IMAGE_MIMES = ["png", "jpg", "bmp"];
      // const semiPos = icon.indexOf(";");
      // const dataType = icon.substring(5, semiPos).toLowerCase();
      // if (!VALID_IMAGE_MIMES.includes(dataType)) break;
      b64Uri = icon;
      break;
    default:
      break;
  }
  if (b64Uri === null) return ERROR_IMG;
  return b64Uri;
}

function determineImageType(imgPath) {
  if (imgPath.startsWith("https://") || imgPath.startsWith("http://"))
    return "url";
  if (imgPath.startsWith(":/", 1) || imgPath.startsWith(":\\", 1))
    return "local";
  if (imgPath.startsWith("data:")) return "base64";
  return null;
}

async function pathToBase64(filepath) {
  logger("filepath check " + filepath);
  const VALID_IMAGES = [".png", ".jpeg", ".jpg", ".bmp"];
  const extName = path.extname(filepath.toLowerCase());
  logger("ext name: " + extName);
  const isValid = VALID_IMAGES.includes(extName);
  logger("valid? " + isValid);
  if (!isValid) return null;
  try {
    logger("was valid!");
    const data = await fsP.readFile(filepath);
    logger("read path!");
    const b64 = `data:image/${extName.substring(1)};base64,${Buffer.from(
      data,
      "binary"
    ).toString("base64")}`;
    logger("done! result: " + b64);
    return b64;
  } catch (e) {
    logger("file to b64 errored... " + e);
    return null;
  }
}

async function urlImgToBase64(url) {
  try {
    const res = await axios.get(url, {
      responseType: "arraybuffer",
    });
    const type = res.headers["content-type"];
    if (!type.startsWith("image")) return null;
    const imgBuffer = Buffer.from(res.data);
    return `data:${type};base64,${imgBuffer.toString("base64")}`;
  } catch (e) {
    return null;
  }
}
