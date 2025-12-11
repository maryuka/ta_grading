import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { FilterProvider } from './contexts/FilterContext.jsx'
import App from './App.jsx'
import './index.css'

const root = document.getElementById('root');
if (!root) {
    console.error('Root element not found');
} else {
    console.log('Rendering React app...');
    ReactDOM.createRoot(root).render(
        <React.StrictMode>
            <BrowserRouter>
                <FilterProvider>
                    <App />
                </FilterProvider>
            </BrowserRouter>
        </React.StrictMode>,
    );
}