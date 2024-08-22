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
          collection[`device_${data.device}`].actions[
            `act_${data.payload.settings.actionId}`
          ].title,
        actionId: data.payload.settings.actionId,
        // state:
        //   collection[`device_${data.device}`].actions[
        //     `act_${data.payload.settings.actionId}`
        //   ].state,
        customProperties:
          collection[`device_${data.device}`].actions[
            `act_${data.payload.settings.actionId}`
          ].customProperties,
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
          collection[`device_${data.device}`].actions[
            `act_${data.payload.settings.actionId}`
          ].title,
        actionId: data.payload.settings.actionId,
        // state:
        //   collection[`device_${data.device}`].actions[
        //     `act_${data.payload.settings.actionId}`
        //   ].state,
        customProperties:
          collection[`device_${data.device}`].actions[
            `act_${data.payload.settings.actionId}`
          ].customProperties,
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

      if (
        typeof collectionQueue[`id_${data.payload.settings?.actionId}`] ===
        "object"
      ) {
        const queuedPayload =
          collectionQueue[`id_${data.payload.settings.actionId}`];
        collectionUpdateDeviceAction(
          data.device,
          data.payload.settings.actionId,
          queuedPayload
        );
        delete collectionQueue[`id_${data.payload.settings.actionId}`];
      } else {
      }

      //always update
      // collectionUpdateDeviceAction(
      //   data.device,
      //   data.payload.settings.actionId,
      //   {
      //     context: data.context,
      //   }
      // );
      logger(
        "attempting to add context " +
          data.context +
          " to collection with the action id " +
          data.payload.settings.actionId
      );
      addContextToCollection(
        data.payload.settings.actionId,
        data.device,
        data.context
      );

      // //state
      // if (
      //   !collection[`device_${data.device}`].actions[
      //     `act_${data.payload.settings.actionId}`
      //   ]?.state
      // ) {
      //   setState(
      //     data.device,
      //     data.payload.settings.actionId,
      //     data.payload.settings.state,
      //     true
      //   );
      // } else {
      //   setState(
      //     data.device,
      //     data.payload.settings.actionId,
      //     collection[`device_${data.device}`].actions[
      //       `act_${data.payload.settings.actionId}`
      //     ].state,
      //     false
      //   );
      // }

      //custom properties
      if (
        !collection[`device_${data.device}`].actions[
          `act_${data.payload.settings.actionId}`
        ]?.customProperties
      ) {
        setCustomProperties(
          data.device,
          data.payload.settings.actionId,
          data.payload.settings.customProperties,
          true
        );
      } else {
        setCustomProperties(
          data.device,
          data.payload.settings.actionId,
          collection[`device_${data.device}`].actions[
            `act_${data.payload.settings.actionId}`
          ].customProperties,
          false
        );
      }
      //title
      if (
        !collection[`device_${data.device}`].actions[
          `act_${data.payload.settings.actionId}`
        ]?.title
      ) {
        setTitle(
          data.device,
          data.payload.settings.actionId,
          data.payload.settings.title,
          true
        );
      } else {
        setTitle(
          data.device,
          data.payload.settings.actionId,
          collection[`device_${data.device}`].actions[
            `act_${data.payload.settings.actionId}`
          ].title,
          false
        );
      }

      //icon
      if (
        !collection[`device_${data.device}`].actions[
          `act_${data.payload.settings.actionId}`
        ]?.icon
      ) {
        setIcon(
          data.device,
          data.payload.settings.actionId,
          data.payload.settings.icon,
          true,
          "Elgato"
        );
      } else {
        setIcon(
          data.device,
          data.payload.settings.actionId,
          collection[`device_${data.device}`].actions[
            `act_${data.payload.settings.actionId}`
          ].icon,
          false,
          "Elgato"
        );
      }

      break;
    case "willDisappear":
      logger("removing context from collection");
      removeContextFromCollection(data.payload.settings.actionId, data.device);
      break;
    default:
      break;
  }
}

function parsePiEvent(piEvent, data) {
  switch (piEvent) {
    case "freshActionId":
      logger("oh, fresh ID! " + data.actionId);
      collectionUpdateDeviceAction(data.device, data.actionId, {
        context: data.context,
      });
      break;
    // case "setState":
    //   setState(data.device, data.actionId, data.icon, true, "PI");
    //   break;
    case "setCustomProperties":
      setCustomProperties(
        data.device,
        data.actionId,
        data.customProperties,
        true,
        "PI"
      );
      break;
    case "setTitle":
      setTitle(data.device, data.actionId, data.title, true);
      break;
    case "setIcon":
      setIcon(data.device, data.actionId, data.icon, true, "PI");
      break;
    default:
      break;
  }
}
function fetchContextFromCollection(actionId, device) {
  const ctx =
    collection[`device_${device}`]?.actions[`act_${actionId}`]?.context;
  if (ctx === undefined) return null;
  return ctx;
}

function removeContextFromCollection(actionId, device) {
  if (
    collection[`device_${device}`]?.actions[`act_${actionId}`]?.context ===
    undefined
  )
    return;

  delete collection[`device_${device}`].actions[`act_${actionId}`].context;
}

function addContextToCollection(actionId, device, ctx) {
  //make sure action obj exists before trying to add context
  if (
    typeof collection[`device_${device}`].actions[`act_${actionId}`] !==
    "object"
  ) {
    collection[`device_${device}`].actions[`act_${actionId}`] = {};
  }

  collection[`device_${device}`].actions[`act_${actionId}`].context = ctx;

  logger(`added context ${ctx} to action id ${actionId} in device ${device}`);
}

function SAMMIUpdateAction(actionId, sammiPayload) {
  const actionInfo = fetchActionInfoFromActionId(actionId);
  if (actionInfo === null) {
    logger(
      "WARN: SAMMI Update Action failed because it could not find actionInfo from actionID " +
        actionId
    );
    logger("WARN: Queueing actionID");
    //create object if it doesnt already exist
    if (typeof collectionQueue[`id_${actionId}`] !== "object") {
      collectionQueue[`id_${actionId}`] = {};
    }

    collectionQueue[`id_${actionId}`] = {
      ...collectionQueue[`id_${actionId}`],
      ...sammiPayload,
    };
    collectionQueue[`id_${actionId}`].actionId = actionId;
    logger("echoed queue: " + JSON.stringify(collectionQueue));
    return;
  }

  if (sammiPayload.title !== null) {
    setTitle(actionInfo.device, actionId, sammiPayload.title, true);
  }
  if (sammiPayload.icon !== null) {
    setIcon(actionInfo.device, actionId, sammiPayload.icon, true, "SAMMI");
  }
  // if (sammiPayload.state !== null) {
  //   setState(actionInfo.device, actionId, sammiPayload.state, true);
  // }
  if (sammiPayload.customProperties !== null) {
    setCustomProperties(
      actionInfo.device,
      actionId,
      sammiPayload.customProperties,
      true,
      "SAMMI"
    );
  }
}

function registerElgatoPlugin() {
  sendToElgatoWs({
    event: elgatoData.registerEvent,
    uuid: elgatoData.pluginUUID,
  });
}

function fetchActionInfoFromActionId(actionId) {
  for (let deviceKey in collection) {
    if (collection[deviceKey]?.actions[`act_${actionId}`]?.context) {
      return {
        device: deviceKey.replace("device_", ""),
        context: collection[deviceKey].actions[`act_${actionId}`].context,
      };
    }
  }
  return null;
}

function collectionUpdateDeviceAction(device, actionId, actionSettings) {
  if (!device || !actionId) {
    logger("ERR: no device or action id was provided, exiting");
    return;
  }
  if (!actionSettings) {
    logger("ERR: no action settings to update, exiting");
    return;
  }
  logger(
    `collectionUpdateDeviceAction recieved parameters: ${device}, ${actionId}, ${actionSettings}`
  );

  if (
    typeof collection[`device_${device}`].actions[`act_${actionId}`] !==
    "object"
  ) {
    logger("first time action in collection, adding new");
    collection[`device_${device}`].actions[`act_${actionId}`] = {};
  }

  //queue check
  logger(
    'checking to see if the action id "' +
      actionId +
      '" provided exists in queue'
  );
  logger("checking queue: " + typeof collectionQueue[`id_${actionId}`]);
  if (typeof collectionQueue[`id_${actionId}`] === "object") {
    logger("wow, it does! grab settings and merge, then remove");
    actionSettings = {
      ...actionSettings,
      ...collectionQueue[`id_${actionId}`],
    };
    delete collectionQueue[`id_${actionId}`];
  }

  for (const property in actionSettings) {
    if (actionSettings[property] !== null) {
      collection[`device_${device}`].actions[`act_${actionId}`][property] =
        actionSettings[property];
    }
  }

  logger("successfully added new action data to collection, echoing");
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

async function setIcon(device, actionId, icon, update, source) {
  const actionInfo = fetchActionInfoFromActionId(actionId);
  if (actionInfo === null) {
    logger("ERR: Could not fetch action info in setIcon");
    return;
  }

  if (update) {
    collectionUpdateDeviceAction(device, actionId, { icon: icon });
  }

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

  sendToElgatoWs({
    event: "setImage",
    context: actionInfo.context,
    payload: {
      image: parsedIcon,
    },
  });
}

async function setCustomProperties(device, actionId, customProperties, update) {
  logger("requested to set custom properties, recieved params:");
  logger(
    `${device},  ${actionId}, ${JSON.stringify(customProperties)}, ${update}`
  );
  if (update) {
    collectionUpdateDeviceAction(device, actionId, {
      customProperties: customProperties,
    });
  }
}
// async function setState(device, actionId, state, update) {
//   if (update) {
//     collectionUpdateDeviceAction(device, actionId, { state: state });
//   }
// }
async function setTitle(device, actionId, title, update) {
  logger("requested to set title, recieved params:");
  logger(`${device},  ${actionId}, ${title}, ${update}`);
  const actionInfo = fetchActionInfoFromActionId(actionId);
  if (actionInfo === null) {
    logger("ERR: Could not fetch action info in setTitle");
    return;
  }

  if (update) {
    collectionUpdateDeviceAction(device, actionId, { title: title });
  }
  sendToElgatoWs({
    event: "setTitle",
    context: actionInfo.context,
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
  if (icon === "")
    return await pathToBase64(path.join(__dirname, "img", "main.png"));

  let b64Uri = null;
  const type = determineImageType(icon);
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
