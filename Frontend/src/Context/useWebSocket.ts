import {useEffect} from 'react';
import {useSettingsUpdater} from './SettingsContext';
import {sendMessageToBackend} from '../Utils/MessageUtils'

type WebSocketURL = string;

export function useWebSocket(url: WebSocketURL) {
  const updateSettings = useSettingsUpdater();

  useEffect(() => {
    const ws = new WebSocket(url);

    ws.onopen = () => {
      console.log('Connected to WebSocket server');
      sendMessageToBackend('GetSettings')
    };

    ws.onmessage = (event) => {
      try {
        const newSettings = JSON.parse(event.data);
        console.log('Received settings update:', newSettings);
        updateSettings(newSettings, true); // Update the settings with the received data
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    ws.onclose = () => {
      console.log('Disconnected from WebSocket server');
    };

    ws.onerror = (error) => {
      console.error('WebSocket error occurred:', error);
    };

    return () => {
      //ws.close();
    };
  }, [url, updateSettings]);
}