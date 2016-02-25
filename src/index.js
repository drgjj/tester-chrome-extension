const BASE_URL = 'https://portal.rainforestqa.com';

const manifest = chrome.runtime.getManifest();

// Start disabled: require the tester to enable if they want to
// work when the browser starts
let checkingActive = false;
const infoHash = {
  tester_state: 'active',
  work_available_endpoint: `${BASE_URL}/api/1/testers/`,
  email: '',
  id: '',
  version: manifest.version,
};

// Set polling interval in milliseconds (note, this is rate limted,
// so if you change agressively, it will error)
const defaultCheckForWorkInterval = 8 * 1000;
let checkForWorkInterval = defaultCheckForWorkInterval;

//
// Load the initial id value from storage
//
chrome.storage.sync.get('worker_uuid', data => {
  // Notify that we saved.
  if (data.worker_uuid !== undefined) {
    infoHash.uuid = data.worker_uuid;
    setChecking(checkingActive);
  } else {
    makeNewSyncTab();
  }
});

//
// Load the initial api endpoint value from storage
//
chrome.storage.sync.get('work_available_endpoint', data => {
  // Notify that we saved.
  if (data.work_available_endpoint !== undefined) {
    infoHash.work_available_endpoint = data.work_available_endpoint;
    setChecking(checkingActive);
  } else {
    makeNewSyncTab();
  }
});


// Handle the icon being clicked
//
// this enables or disables checking for new work
//
chrome.browserAction.onClicked.addListener(() => {
  checkingActive = !checkingActive;
  setChecking(checkingActive);
});

// Handle data coming from the main site

chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
  if (request.data) {
    if (request.data.worker_uuid && request.data.work_available_endpoint) {
      infoHash.uuid = request.data.worker_uuid;
      infoHash.work_available_endpoint = request.data.work_available_endpoint;
      setChecking(checkingActive);
      sendResponse({ok: true});

      chrome.storage.sync.set(
        {
          worker_uuid: request.data.worker_uuid,
          work_available_endpoint: request.data.work_available_endpoint,
        },
        () => {}
      );
    }
  }
});

// Set checking state

function setChecking(state) {
  if (!state) {
    chrome.browserAction.setBadgeBackgroundColor({color: [255, 0, 0, 230]});
    chrome.browserAction.setBadgeText({text: 'OFF'});
  } else {
    checkForWork();
  }
}

// Open or focus the main work tab

let workTab = null;

function openOrFocusTab(url) {
  if (workTab === null && typeof workTab === 'object') {
    makeNewWorkTab(url);
  } else {
    refreshTabInfo();
  }
}

// Make sure the work tab is open and in focus

function refreshTabInfo() {
  chrome.tabs.get(workTab.id, t => {
    if (chrome.runtime.lastError) {
      workTab = null;
    } else {
      workTab = t;

      // force selection
      if (!workTab.selected) {
        chrome.tabs.update(workTab.id, {selected: true});
      }
    }
  });
}


//
// Open a new work tab
//
function makeNewWorkTab(url) {
  // make a new tab
  chrome.tabs.create({url}, t => {
    workTab = t;
  });
}

//
// Open a sync tab
//
function makeNewSyncTab() {
  // make a new tab
  chrome.tabs.create({url: `${BASE_URL}/profile?version=${manifest.version}`}, () => {
  });
}

// Poll for new work

function checkForWork() {
  if (infoHash.uuid === '' || infoHash.uuid === undefined) {
    return false;
  }

  const xhr = new XMLHttpRequest();

  xhr.open(
    'GET',
    `${infoHash.work_available_endpoint}${infoHash.uuid}/work_available?info=${JSON.stringify(infoHash)}`,
    true);

  xhr.onreadystatechange = () => {
    if (xhr.readyState === 4 && checkingActive) {
      const resp = JSON.parse(xhr.responseText);
      if (resp.work_available) {
        chrome.browserAction.setBadgeBackgroundColor({color: [0, 255, 0, 230]});
        chrome.browserAction.setBadgeText({text: 'YES'});

        openOrFocusTab(resp.url);
      } else {
        chrome.browserAction.setBadgeBackgroundColor({color: [0, 0, 0, 230]});
        chrome.browserAction.setBadgeText({text: 'NO'});
      }
    }
  };
  xhr.send();

  if (checkingActive) {
    setTimeout(() => {
      xhr.abort();
      checkForWork();
    }, checkForWorkInterval);
  }

  return true;
}

// Get user information

chrome.identity.getProfileUserInfo(info => {
  infoHash.email = info.email;
  infoHash.id = info.id;
});

// Get idle checking - this drops the polling rate
// for "inactive" users (i.e. when AFK)

let shutOffTimer;
chrome.idle.setDetectionInterval(defaultCheckForWorkInterval * 3 / 1000);
chrome.idle.onStateChanged.addListener(state => {
  infoHash.tester_state = state;
  if (state === 'idle') {
    checkForWorkInterval = defaultCheckForWorkInterval * 10;
    shutOffTimer = setTimeout(() => {
      if (infoHash.tester_state === 'idle') {
        checkingActive = false;
        setChecking(checkingActive);
      }
    }, defaultCheckForWorkInterval * 45);
  } else if (state === 'active') {
    clearTimeout(shutOffTimer);
    checkForWorkInterval = defaultCheckForWorkInterval;
  }
});
