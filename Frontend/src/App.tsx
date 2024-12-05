import {useEffect, useState} from 'react';
import Settings from "./Pages/settings";
import Menu from "./menu";
import {useWebSocket} from './Context/useWebSocket';
import Videos from './Pages/videos';
import Clips from './Pages/clips';
import {SettingsProvider} from './Context/SettingsContext';
import Video from './Pages/video';
import {ModalProvider} from './Context/ModalContext';
import {useSelectedVideo} from './Context/SelectedVideoContext';
import { themeChange } from 'theme-change';

function App() {
	useEffect(() => {
		themeChange(false);
	}, []);

  function WebSocketHandler() {
		useWebSocket('ws://localhost:5000/'); // Now inside WebSocketProvider context
    return null; // This component doesn't render UI
  }

	const {selectedVideo, setSelectedVideo} = useSelectedVideo();
	const [selectedMenu, setSelectedMenu] = useState('Videos');

	const handleMenuSelection = (menu: any) => {
		setSelectedVideo(null);
		setSelectedMenu(menu);
	};

	const renderContent = () => {
		if (selectedVideo) {
			return <Video video={selectedVideo} />;
		}

		switch (selectedMenu) {
			case 'Videos':
				return <Videos />;
			case 'Clips':
				return <Clips />;
			default:
				return <Settings />;
		}
	};

	return (
		<SettingsProvider>
			<ModalProvider>
				<WebSocketHandler />
				<div className="flex h-screen">
					<div className="h-full">
						<Menu selectedMenu={selectedMenu} onSelectMenu={handleMenuSelection} />
					</div>
					<div className="flex-1 p-3 max-h-full overflow-auto">
						{renderContent()}
					</div>
				</div>
			</ModalProvider>
		</SettingsProvider >
	);
}

export default App
