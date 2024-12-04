import {StrictMode} from 'react'
import {createRoot} from 'react-dom/client'
import "./globals.css";
import App from './App.tsx'
import {SelectedVideoProvider} from './Context/SelectedVideoContext.tsx'

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<SelectedVideoProvider>
			<App />
		</SelectedVideoProvider>
	</StrictMode>,
)
