'use client';
import React from "react";

export default function Settings() {
  const sendMessageToBackend = () => {
    if (window.external && typeof window.external.sendMessage === 'function') {
      window.external.sendMessage("Hello from React!");
    } else {
      console.error("window.external.sendMessage is not available.");
    }
  };

  return (
    <div>
      <button
        className="btn btn-primary"
        onClick={sendMessageToBackend}
      >
        Setting
      </button>
    </div>
  );
}
