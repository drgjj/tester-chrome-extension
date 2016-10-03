import listenStoreChanges from '../listenStoreChanges';
import { notifications, captcha } from './notifications';
import { playSoundOnce } from '../playSound';

const handleCaptcha = (store, chrome) => {
  const handleUpdate = ({ polling: prevPolling }, { polling: curPolling }) => {
    if (!prevPolling.get('captchaRequired') && curPolling.get('captchaRequired')) {
      chrome.notifications.create(captcha, notifications[captcha]);
      playSoundOnce(store.getState().plugin.get('options'));
    }
  };

  listenStoreChanges(store, handleUpdate);

  chrome.notifications.onClicked.addListener(notificationId => {
    if (notificationId === captcha) {
      const url = store.getState().polling.get('pollUrl');
      if (!url) {
        // Not polling, so not a problem
        return;
      }

      chrome.tabs.create({ url });
    }
  });
};

export default handleCaptcha;
