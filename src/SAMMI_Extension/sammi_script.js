const SD_PLUGIN_PORT = 9880;
const SD_PLUGIN_CONNECTION_INTERVAL = 3000;

window.addEventListener("load", () => {
  sdPluginConnectToWs(); //begin loop
});

async function sdPluginDelay(ms) {
  new Promise(res => setTimeout(res, ms));
}
async function sdPluginConnectToWs() {
  const wsUrl = `ws://127.0.0.1:${SD_PLUGIN_PORT}/sammi-bridge`;
  window.sdPluginWs = new WebSocket(wsUrl); //use window to work around firefox connection issue
  window.sdPluginWs.onopen = () => {
    console.log("[Elgato StreamDeck] Connected!");
    SAMMI.alert("[Elgato StreamDeck] Connected!");
  };

  window.sdPluginWs.onclose = async () => {
    SAMMI.setVariable("bridge_relay_connected", false, "Sando");
    console.log("[Elgato StreamDeck] Disconnected.");
    console.log(
      `[Elgato StreamDeck] Retrying conection in ${
        SD_PLUGIN_CONNECTION_INTERVAL / 1000
      }s`
    );
    SAMMI.alert("[Elgato StreamDeck] Disconnected.");
    SAMMI.alert(
      `[Elgato StreamDeck] Retrying conection in ${
        SD_PLUGIN_CONNECTION_INTERVAL / 1000
      }s`
    );
    await sdPluginDelay(SD_PLUGIN_CONNECTION_INTERVAL);
    sdPluginConnectToWs();
  };

  window.sdPluginWs.onerror = error => {
    console.log("[Elgato StreamDeck] Relay Server ERROR:");
    console.error(error);
  };

  window.sdPluginWs.onmessage = event => {
    const eventData = JSON.parse(event.data);
    console.log(eventData);
    switch (eventData.event) {
      case "error":
        SAMMI.alert(`[Elgato Streamdeck] ERR: ${eventData.msg}`);
        break;
      case "pressed":
        SAMMI.triggerExt("Elgato StreamDeck: Pressed", {
          action_id: eventData.actionId,
          title: eventData.title,
          type: eventData.event,
          state: eventData.state
        });
        break;
      case "released":
        SAMMI.triggerExt("Elgato StreamDeck: Released", {
          action_id: eventData.actionId,
          title: eventData.title,
          type: eventData.event,
          state: eventData.state
        });
        break;
      default:
        break;
    }
  };
}

// command functions

function sdPluginCUpdateAction(
  actionId,
  title,
  icon,
  state,
  btn,
  instanceId
) {
  if (!actionId) {
    SAMMI.alert(
      `[Elgato StreamDeck] ERR: No action ID specified in button "${btn}"`
    );
    return;
  }
  const payload = {
    event: "SAMMIUpdateAction",
    actionId: actionId,
    payload: {
      title: title ? title : null,
      icon: icon ? icon : null,
      state: state ? state : null
    },
  };

  window.sdPluginWs.send(JSON.stringify(payload));

  // if (saveVar) {
  //   SAMMI.setVariable(saveVar, true, btn, instanceId);
  // }
}
