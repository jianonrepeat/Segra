'use client';
import React, {useEffect} from 'react';
import {useSettings, useSettingsUpdater} from '../Context/SettingsContext';
import {sendMessageToBackend} from '../Utils/MessageUtils';
import {themeChange} from 'theme-change';
import { AudioDevice } from '../Models/types';

export default function Settings() {
  const settings = useSettings();
  const updateSettings = useSettingsUpdater();

  const handleChange = (event) => {
    const {name, value} = event.target;
    const numericalFields = ['frameRate', 'bitrate', 'storageLimit', 'keyframeInterval', 'crfValue', 'cqLevel'];
    updateSettings({
      [name]: numericalFields.includes(name) ? Number(value) : value,
    });
  };

  const handleBrowseClick = () => {
    sendMessageToBackend('SetVideoLocation'); // Opens folder picker
  };

  useEffect(() => {
    themeChange(false);
  }, []);

  // Helper function to check if the selected device is available
  const isDeviceAvailable = (deviceId: string, devices: AudioDevice[]) => {
    return devices.some((device) => device.id === deviceId);
  };

  // Get the name of the selected input device, or indicate if it's unavailable
  const selectedInputDevice = settings.state.inputDevices.find((device) => device.id === settings.inputDevice);
  const inputDeviceName = selectedInputDevice ? selectedInputDevice.name : settings.inputDevice ? 'Unavailable Device' : 'Select Input Device';

  // Get the name of the selected output device, or indicate if it's unavailable
  const selectedOutputDevice = settings.state.outputDevices.find((device) => device.id === settings.outputDevice);
  const outputDeviceName = selectedOutputDevice ? selectedOutputDevice.name : settings.outputDevice ? 'Unavailable Device' : 'Select Output Device';

  // Warning SVG as a React component
  const WarningIcon = (
    <svg
      className="inline-block w-4 h-4 mr-1 text-red-600"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      stroke="#fa0000"
    >
      <path
        d="M12 15H12.01M12 12V9M4.98207 19H19.0179C20.5615 19 21.5233 17.3256 20.7455 15.9923L13.7276 3.96153C12.9558 2.63852 11.0442 2.63852 10.2724 3.96153L3.25452 15.9923C2.47675 17.3256 3.43849 19 4.98207 19Z"
        stroke="#f00000"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      ></path>
    </svg>
  );

  return (
    <div className="p-2 space-y-6 rounded-lg">
      <h1 className="text-3xl font-bold">Settings</h1>

      {/* Theme Selection */}
      <select
        name="theme"
        value={settings.theme}
        onChange={handleChange}
        data-choose-theme
        className="select select-bordered w-full max-w-xs"
      >
        <option value="recaps">ReCaps</option>
        <option value="dark">Dark</option>
        <option value="night">Night</option>
        <option value="dracula">Dracula</option>
        <option value="black">Black</option>
        <option value="luxury">Luxury</option>
        <option value="forest">Forest</option>
        <option value="halloween">Halloween</option>
        <option value="coffee">Coffee</option>
        <option value="dim">Dim</option>
        <option value="sunset">Sunset</option>
      </select>

      {/* Video Settings */}
      <div className="p-4 bg-base-300 rounded-lg shadow-md">
        <h2 className="text-xl font-semibold mb-4">Video Settings</h2>
        <div className="grid grid-cols-2 gap-4">
          {/* Resolution */}
          <div className="form-control">
            <label className="label">
              <span className="label-text">Resolution</span>
            </label>
            <select
              name="resolution"
              value={settings.resolution}
              onChange={handleChange}
              className="select select-bordered"
            >
              <option value="720p">720p</option>
              <option value="1080p">1080p</option>
              <option value="1440p">1440p</option>
              <option value="4K">4K</option>
            </select>
          </div>

          {/* Frame Rate */}
          <div className="form-control">
            <label className="label">
              <span className="label-text">Frame Rate (FPS)</span>
            </label>
            <select
              name="frameRate"
              value={settings.frameRate}
              onChange={handleChange}
              className="select select-bordered"
            >
              <option value="24">24</option>
              <option value="30">30</option>
              <option value="60">60</option>
              <option value="120">120</option>
              <option value="144">144</option>
            </select>
          </div>

          {/* Rate Control */}
          <div className="form-control">
            <label className="label">
              <span className="label-text">Rate Control</span>
            </label>
            <select
              name="rateControl"
              value={settings.rateControl}
              onChange={handleChange}
              className="select select-bordered"
            >
              <option value="CBR">CBR (Constant Bitrate)</option>
              <option value="VBR">VBR (Variable Bitrate)</option>
              <option value="CRF">CRF (Constant Rate Factor)</option>
              <option value="CQP">CQP (Constant Quantization Parameter)</option>
            </select>
          </div>

          {/* Bitrate (for CBR and VBR) */}
          {(settings.rateControl === 'CBR' || settings.rateControl === 'VBR') && (
            <div className="form-control">
              <label className="label">
                <span className="label-text">Bitrate (Mbps)</span>
              </label>
              <select
                name="bitrate"
                value={settings.bitrate}
                onChange={handleChange}
                className="select select-bordered"
              >
                {Array.from({length: 19}, (_, i) => (i + 2) * 5).map((value) => (
                  <option key={value} value={value}>
                    {value} Mbps
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* CRF Value (for CRF) */}
          {settings.rateControl === 'CRF' && (
            <div className="form-control">
              <label className="label">
                <span className="label-text">CRF Value (0-51)</span>
              </label>
              <input
                type="number"
                name="crfValue"
                value={settings.crfValue}
                onChange={handleChange}
                min="0"
                max="51"
                className="input input-bordered"
              />
            </div>
          )}

          {/* CQ Level (for CQP) */}
          {settings.rateControl === 'CQP' && (
            <div className="form-control">
              <label className="label">
                <span className="label-text">CQ Level (0-30)</span>
              </label>
              <input
                type="number"
                name="cqLevel"
                value={settings.cqLevel}
                onChange={handleChange}
                min="0"
                max="30"
                className="input input-bordered"
              />
            </div>
          )}

          {/* Encoder */}
          <div className="form-control">
            <label className="label">
              <span className="label-text">Video Encoder</span>
            </label>
            <select
              name="encoder"
              value={settings.encoder}
              onChange={handleChange}
              className="select select-bordered"
            >
              <option value="gpu">GPU</option>
              <option value="cpu">CPU</option>
            </select>
          </div>

          {/* Codec */}
          <div className="form-control">
            <label className="label">
              <span className="label-text">Codec</span>
            </label>
            <select
              name="codec"
              value={settings.codec}
              onChange={handleChange}
              className="select select-bordered"
            >
              <option value="h264">H.264</option>
              <option value="h265">H.265</option>
            </select>
          </div>
        </div>
      </div>

      {/* Storage Settings */}
      <div className="p-4 bg-base-300 rounded-lg shadow-md">
        <h2 className="text-xl font-semibold mb-4">Storage Settings</h2>
        <div className="grid grid-cols-2 gap-4">
          {/* Recording Path */}
          <div className="form-control">
            <label className="label">
              <span className="label-text">Recording Path</span>
            </label>
            <div className="flex space-x-2">
              <input
                type="text"
                name="contentFolder"
                value={settings.contentFolder}
                onChange={handleChange}
                placeholder="Enter or select folder path"
                className="input input-bordered flex-1"
              />
              <button onClick={handleBrowseClick} className="btn btn-primary">
                Browse
              </button>
            </div>
          </div>

          {/* Storage Limit */}
          <div className="form-control">
            <label className="label">
              <span className="label-text">Storage Limit (GB)</span>
            </label>
            <input
              type="number"
              name="storageLimit"
              value={settings.storageLimit}
              onChange={handleChange}
              placeholder="Set maximum storage in GB"
              min="1"
              className="input input-bordered"
            />
          </div>
        </div>
      </div>

      {/* Input/Output Devices */}
      <div className="p-4 bg-base-300 rounded-lg shadow-md">
        <h2 className="text-xl font-semibold mb-4">Input/Output Devices</h2>
        <div className="grid grid-cols-2 gap-4">
          {/* Input Device */}
          <div className="form-control">
            <label className="label">
              <span className="label-text">Input Device</span>
            </label>
            <div className="relative">
              <select
                name="inputDevice"
                value={settings.inputDevice}
                onChange={handleChange}
                className="select select-bordered w-full"
              >
                <option value={''}>
                  Select Input Device
                </option>
                {/* If the selected device is not available, show it with a warning */}
                {!isDeviceAvailable(settings.inputDevice, settings.state.inputDevices) && settings.inputDevice && (
                  <option value={settings.inputDevice}>
                    ⚠️ &lrm;
                    {inputDeviceName}
                  </option>
                )}
                {/* List available input devices */}
                {settings.state.inputDevices.map((device) => (
                  <option key={device.id} value={device.id}>
                    {device.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Output Device */}
          <div className="form-control">
            <label className="label">
              <span className="label-text">Output Device</span>
            </label>
            <div className="relative">
              <select
                name="outputDevice"
                value={settings.outputDevice}
                onChange={handleChange}
                className="select select-bordered w-full"
              >
                <option value={''}>
                  Select Output Device
                </option>
                {/* If the selected device is not available, show it with a warning */}
                {!isDeviceAvailable(settings.outputDevice, settings.state.outputDevices) && settings.outputDevice && (
                  <option value={settings.outputDevice}>
                    ⚠️ &lrm;
                    {outputDeviceName}
                  </option>
                )}
                {/* List available output devices */}
                {settings.state.outputDevices.map((device) => (
                  <option key={device.id} value={device.id}>
                    {device.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Advanced Settings */}
      <div className="p-4 bg-base-300 rounded-lg shadow-md">
        <h2 className="text-xl font-semibold mb-4">Advanced Settings</h2>
        <div className="grid grid-cols-2 gap-4">
          {/* Keyframe Interval */}
          <div className="form-control">
            <label className="label">
              <span className="label-text">Keyframe Interval (Seconds)</span>
            </label>
            <input
              type="number"
              name="keyframeInterval"
              value={settings.keyframeInterval}
              onChange={handleChange}
              className="input input-bordered"
            />
          </div>

          {/* Preset */}
          <div className="form-control">
            <label className="label">
              <span className="label-text">Preset</span>
            </label>
            <select
              name="preset"
              value={settings.preset}
              onChange={handleChange}
              className="select select-bordered"
            >
              <option value="fast">Fast</option>
              <option value="medium">Medium</option>
              <option value="slow">Slow</option>
            </select>
          </div>

          {/* Profile */}
          <div className="form-control">
            <label className="label">
              <span className="label-text">Profile</span>
            </label>
            <select
              name="profile"
              value={settings.profile}
              onChange={handleChange}
              className="select select-bordered"
            >
              <option value="baseline">Baseline</option>
              <option value="main">Main</option>
              <option value="high">High</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
