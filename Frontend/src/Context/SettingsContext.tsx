import {createContext, useContext, useState, ReactNode} from 'react';
import {Settings, initialSettings} from '../Models/types';
import {sendMessageToBackend} from '../Utils/MessageUtils';
import useWebSocket from 'react-use-websocket';

type SettingsContextType = Settings;
type SettingsUpdateContextType = (newSettings: Partial<Settings>, fromBackend?: boolean) => void;

const SettingsContext = createContext<SettingsContextType>(initialSettings);
const SettingsUpdateContext = createContext<SettingsUpdateContextType>(() => {});

export function useSettings(): SettingsContextType {
	return useContext(SettingsContext);
}

export function useSettingsUpdater(): SettingsUpdateContextType {
	return useContext(SettingsUpdateContext);
}

interface SettingsProviderProps {
	children: ReactNode;
}

export function SettingsProvider({children}: SettingsProviderProps) {
	const [settings, setSettings] = useState<Settings>(initialSettings);

	const updateSettings: SettingsUpdateContextType = (newSettings, fromBackend = false) => {
		const updatedSettings = {
			...settings,
			...newSettings,
			state: {
				...settings.state,
				...newSettings.state,
			},
		};

		setSettings(updatedSettings);

		// Only send UpdateSettings to backend if the change is from the frontend
		if (!fromBackend) {
			sendMessageToBackend('UpdateSettings', updatedSettings);
		}
	};

	useWebSocket(
		'ws://localhost:5000/',
		{
			onOpen: () => {
				console.log('Connected to WebSocket server');
				sendMessageToBackend("GetSettings");
			},
			onMessage: (event: any) => {
				try {
					const newSettings = JSON.parse(event.data);
					console.log('Received settings update:', newSettings);
					updateSettings(newSettings, true);
				} catch (error) {
					console.error('Error parsing WebSocket message:', error);
				}
			},
			share: true
		}
	);

	return (
		<SettingsContext.Provider value={settings}>
			<SettingsUpdateContext.Provider value={updateSettings}>
				{children}
			</SettingsUpdateContext.Provider>
		</SettingsContext.Provider>
	);
}
