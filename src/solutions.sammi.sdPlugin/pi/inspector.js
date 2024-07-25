/// <reference path="../libs/js/property-inspector.js" />
/// <reference path="../libs/js/utils.js" />

const SD_PLUGIN_PORT = 9880;

$PI.onConnected(jsn => {
  //$PI.openUrl("https://landie.land");
  console.log(jsn);
  const form = document.querySelector("#property-inspector");
  const { actionInfo, appInfo, connection, messageType, port, uuid } = jsn;
  const { payload, context, device } = actionInfo;
  const { settings } = payload;
  // let pluginWs = null;
  // connectToPluginWs();

  let stateChanged = false;
  let titleChanged = false;
  let iconChanged = false;
  let backgroundChanged = false;

  Utils.setFormValue(settings, form);

  //when inspector is loaded for an action, checks if blank, if it is, generate new action id
  console.log(settings);
  if (!settings.actionId) {
    console.log("no action id found, generating new and saving");
    settings.actionId = generateActionId();
    Utils.setFormValue(settings, form);
    saveCurrentPI();
    $PI.sendToPlugin({
      event: "freshActionId",
      context: context,
      device: device,
      actionId: settings.actionId,
    });
    // pluginWs.send(
    //   JSON.stringify({
    //     event: "freshActionId",
    //     context: context,
    //     device: device,
    //     actionId: settings.actionId
    //   })
    // );
  } else {
    console.log("action id exists, should be visible now");
  }

  document
    .querySelector('input[name="state"]')
    .addEventListener("input", () => {
      stateChanged = true;
    });
  document
    .querySelector('textarea[name="title"]')
    .addEventListener("input", () => {
      titleChanged = true;
    });
  document.querySelector('input[name="icon"]').addEventListener("input", () => {
    iconChanged = true;
  });
  document
    .querySelector('input[name="background"]')
    .addEventListener("input", () => {
      backgroundChanged = true;
    });

  form.addEventListener(
    "input",
    Utils.debounce(150, () => {
      if (stateChanged) {
        $PI.sendToPlugin({
          event: "setState",
          context: context,
          device: device,
          icon: document.querySelector('input[name="state"]').value,
        });
        stateChanged = false;

      }
      if (titleChanged) {
        //sends to plugin, not directly to elgato yet. plugin will format this properly!
        // pluginWs.send(
        //   JSON.stringify({
        //     event: "setTitle",
        //     context: context,
        //     device: device,
        //     title: document.querySelector('textarea[name="title"]').value,
        //   })
        // );
        $PI.sendToPlugin({
          event: "setTitle",
          context: context,
          device: device,
          title: document.querySelector('textarea[name="title"]').value,
        });
        titleChanged = false;
      }
      if (iconChanged) {
        $PI.sendToPlugin({
          event: "setIcon",
          context: context,
          device: device,
          icon: document.querySelector('input[name="icon"]').value,
        });
        iconChanged = false;

      }
      saveCurrentPI();
    })
  );
  // function connectToPluginWs() {
  //   const url = `ws://127.0.0.1:${SD_PLUGIN_PORT}/pi`;
  //   pluginWs = new WebSocket(url);
  //   pluginWs.onopen = () => {
  //     console.log("connected to plugin server");
  //   };

  //   pluginWs.onclose = async () => {
  //     console.log("closed connection to plugin server");
  //   };

  //   pluginWs.onerror = error => {
  //     console.log("plugin server error, ", error);
  //   };

  //   pluginWs.onmessage = event => {
  //     console.log("recieved event: ", event);
  //   };
  // }
});

$PI.onDidReceiveGlobalSettings(({ payload }) => {
  console.log("onDidReceiveGlobalSettings", payload);
});

/**
 * Provide window level functions to use in the external window
 * (this can be removed if the external window is not used)
 */
window.sendToInspector = data => {
  console.log(data);
};

// document.querySelector('#open-external').addEventListener('click', () => {
//     window.open('../../../external.html');
// });
/**
 * Intended for use when an action is freshly created, or is blank. Required for SAMMI to communicate to actions
 * @returns a randomly generated action ID
 */
function generateActionId() {
  return window.crypto.randomUUID();
}

/**
 * Grabs the current PI form, then saves it's contents. ONLY run this in the $PI.onConnected callback function,
 * as this ensures that the form is available and has contents.
 */
function saveCurrentPI() {
  const form = document.querySelector("#property-inspector");
  const value = Utils.getFormValue(form);
  $PI.setSettings(value);
}

/** 
 * TABS
 * ----
 * 
 * This will make the tabs interactive:
 * - clicking on a tab will make it active
 * - clicking on a tab will show the corresponding content
 * - clicking on a tab will hide the content of all other tabs
 * - a tab must have the class "tab"
 * - a tab must have a data-target attribute that points to the id of the content
 * - the content must have the class "tab-content"
 * - the content must have an id that matches the data-target attribute of the tab
 * 
 *  <div class="tab selected" data-target="#tab1" title="Show some inputs">Inputs</div>
 *  <div class="tab" data-target="#tab2" title="Here's some text-areas">Text</div>
 * a complete tab-example can be found in the index.html
   <div type="tabs" class="sdpi-item">
      <div class="sdpi-item-label empty"></div>
      <div class="tabs">
        <div class="tab selected" data-target="#tab1" title="Show some inputs">Inputs</div>
        <div class="tab" data-target="#tab2" title="Here's some text-areas">Text</div>
      </div>
    </div>
    <hr class="tab-separator" />
 * You can use the code below to activate the tabs (`activateTabs` and `clickTab` are required)
 */

function activateTabs(activeTab) {
  const allTabs = Array.from(document.querySelectorAll(".tab"));
  let activeTabEl = null;
  allTabs.forEach((el, i) => {
    el.onclick = () => clickTab(el);
    if (el.dataset?.target === activeTab) {
      activeTabEl = el;
    }
  });
  if (activeTabEl) {
    clickTab(activeTabEl);
  } else if (allTabs.length) {
    clickTab(allTabs[0]);
  }
}

function clickTab(clickedTab) {
  const allTabs = Array.from(document.querySelectorAll(".tab"));
  allTabs.forEach((el, i) => el.classList.remove("selected"));
  clickedTab.classList.add("selected");
  activeTab = clickedTab.dataset?.target;
  allTabs.forEach((el, i) => {
    if (el.dataset.target) {
      const t = document.querySelector(el.dataset.target);
      if (t) {
        t.style.display = el == clickedTab ? "block" : "none";
      }
    }
  });
}

activateTabs();
