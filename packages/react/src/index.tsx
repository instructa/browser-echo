'use client';

import { useEffect } from 'react';
import { initBrowserEcho } from '@browser-echo/core';
import type { InitBrowserEchoOptions } from '@browser-echo/core';

export function BrowserEchoProvider(props: InitBrowserEchoOptions = {}) {
  useEffect(() => { if (typeof window !== 'undefined') initBrowserEcho(props); }, []);
  return null;
}
