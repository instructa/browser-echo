import { useEffect } from 'react';
import { initBrowserEcho } from '@browser-echo/core';

function BrowserEchoProvider(props = {}) {
  useEffect(() => {
    if (typeof window !== "undefined")
      initBrowserEcho(props);
  }, []);
  return null;
}

export { BrowserEchoProvider };
