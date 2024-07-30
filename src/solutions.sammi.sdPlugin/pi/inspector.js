/// <reference path="../libs/js/property-inspector.js" />
/// <reference path="../libs/js/utils.js" />

let customPropertiesChanged = false;
let titleChanged = false;
let iconChanged = false;
let backgroundChanged = false;

$PI.onConnected(jsn => {
  //$PI.openUrl("https://landie.land");
  console.log(jsn);
  const form = document.querySelector("#property-inspector");
  const { actionInfo, appInfo, connection, messageType, port, uuid } = jsn;
  const { payload, context, device } = actionInfo;
  const { settings } = payload;
  // let pluginWs = null;
  // connectToPluginWs();

  generateCustomPropertyFields(settings?.customProperties);

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
  document.querySelector("table").addEventListener("input", e => {
    console.log("table changed");
    customPropertiesChanged = true;
  });
  document.querySelector("table").addEventListener("click", e => {
    const target = e.target;
    const isDiscard = target.classList.contains("discard");

    if (isDiscard) {
      const closestTr = target.closest("tr");
      closestTr.parentNode.removeChild(closestTr);
      customPropertiesChanged = true;
      validatePI();
    }
  });

  form.addEventListener(
    "input",
    Utils.debounce(150, () => {
      validatePI();
    })
  );

  function validatePI() {
    console.log("debounced");
    const extras = {};
    if (titleChanged) {
      $PI.sendToPlugin({
        event: "setTitle",
        actionId: settings.actionId,
        device: device,
        title: document.querySelector('textarea[name="title"]').value,
      });
      titleChanged = false;
    }
    if (iconChanged) {
      $PI.sendToPlugin({
        event: "setIcon",
        actionId: settings.actionId,
        device: device,
        icon: document.querySelector('input[name="icon"]').value,
      });
      iconChanged = false;
    }

    if (customPropertiesChanged) {
      // custom properties inject
      const customProperties = buildCustomPropertyObj();
      if (!customProperties) {
        customPropertiesChanged = false;
        return;
      }
      extras.customProperties = customProperties;
      $PI.sendToPlugin({
        event: "setCustomProperties",
        actionId: settings.actionId,
        device: device,
        customProperties: customProperties
      })
      customPropertiesChanged = false;
    }

    saveCurrentPI(extras);
  }
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

function generateCustomPropertyFields(customProperties) {
  console.log("attempting to generating custom properties");
  console.log("provided: ", customProperties);
  if (!customProperties) return;
  //set the first property, then +1 to index on for loop to skip it
  let keys = Object.keys(customProperties);
  console.log("initial length: ", keys.length);
  console.log("initial keys list: ", keys);

  if (keys.length === 0) return;
  console.log("setting the first entry to the inputs that exist");

  document.querySelector(".tdcp-key input").value = keys[0];
  document.querySelector(".tdcp-value input").value = customProperties[keys[0]];
  console.log("done, new keys list: ", keys);

  if (keys.length === 0) return;
  console.log("generating the rest.");

  for (let i = 1; i < keys.length; i++) {
    const key = keys[i];
    const value = customProperties[key];
    createNewProperty(key, value);
  }
}

/**
 * Intended for use when an action is freshly created, or is blank. Required for SAMMI to communicate to actions
 * @returns a randomly generated action ID
 */
function generateActionId() {
  return window.crypto.randomUUID();
}

function buildCustomPropertyObj() {
  const keyNodes = document.querySelectorAll(".trcp");
  const customProperties = {};
  const existingKeys = [];

  const captionCaution = document.querySelector("table caption");
  captionCaution.style.display = "none";
  for (let i = 0; i < keyNodes.length; i++) {
    const keyNode = keyNodes[i];
    keyNode.style.backgroundColor = "";
    const key = keyNode.querySelector(".tdcp-key input").value;
    existingKeys.push(key);
  }

  for (let i = 0; i < keyNodes.length; i++) {
    const keyNode = keyNodes[i];
    const invalid = (msg, targetNode) => {
      console.error(msg);
      console.log(targetNode);
      captionCaution.style.display = "";
      captionCaution.textContent = `⚠ ${msg}`;
      targetNode.style.backgroundColor = "red";
    };
    const key = keyNode.querySelector(".tdcp-key input").value;
    console.log("key value found: ", key);
    const value = keyNode.querySelector(".tdcp-value input").value;
    console.log("value value found: ", value);

    if (key === "") {
      invalid("You must fill out the key field!", keyNode);
      return false;
    }

    if (key.match(/^\d/g)) {
      invalid("Keys cannot start with a number.", keyNode);
      return false;
    }

    if (!key.match(/^[a-zA-Z0-9_]+$/g)) {
      invalid(
        "Keys can only contain letters A-Z, number 0-9, and underscores.",
        keyNode
      );
      return false;
    }

    if (existingKeys.filter(eKey => eKey === key).length > 1) {
      invalid("You cannot have duplicate keys.", keyNode);
      return false;
    }

    //valid for object
    customProperties[key] = value;
  }
  return customProperties;
}

/**
 * Grabs the current PI form, then saves it's contents. ONLY run this in the $PI.onConnected callback function,
 * as this ensures that the form is available and has contents.
 */
function saveCurrentPI(extras) {
  const form = document.querySelector("#property-inspector");
  let value = Utils.getFormValue(form);

  if (typeof extras === "object" && Object.keys(extras).length > 0) {
    value = {
      ...value,
      ...extras,
    };
  }

  console.log("value to save persistently: ", value);
  $PI.setSettings(value);
}

//table listener
document.querySelector("table").addEventListener("click", e => {});

function createNewProperty(key, value) {
  const table = document.querySelector("table tbody");
  const tr = document.createElement("tr");
  const td = document.createElement("td");
  const td2 = document.createElement("td");
  tr.classList.add("trcp");
  td.classList.add("tdcp-key");
  td2.classList.add("tdcp-value");
  const tdInput = parseHTMLFromString(`<input type="text">`);
  const td2Input = parseHTMLFromString(`<input type="text">`);
  const td2Discard = parseHTMLFromString(`<button type="button" class="discard">
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor"
                                    class="bi bi-trash" viewBox="0 0 16 16" style="
                                margin: 0;">
                                    <path
                                        d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0z">
                                    </path>
                                    <path
                                        d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4zM2.5 3h11V2h-11z">
                                    </path>
                                </svg>
                            </button>`);
  if (key) {
    tdInput.value = key;
  }
  if (value) {
    td2Input.value = value;
  }
  td.appendChild(tdInput);
  td2.appendChild(td2Input);
  td2.appendChild(td2Discard);
  tr.appendChild(td);
  tr.appendChild(td2);
  table.insertBefore(tr, table.lastElementChild);
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

/**
 * Parses HTML contained in a string to a HTML Node
 *
 * @param   htmlString  String containing HTML to parse
 * @returns NodeElement of parsed HTML string
 */
function parseHTMLFromString(htmlString) {
  const parser = new DOMParser();
  const parsedHTML = parser.parseFromString(htmlString, "text/html");
  return parsedHTML.body.firstChild;
}

activateTabs();
