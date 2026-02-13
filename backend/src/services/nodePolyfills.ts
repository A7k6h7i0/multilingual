

import { EventEmitter } from 'events';
import WebSocket from 'ws';
import wrtc from '@roamhq/wrtc';

// Use globalThis for cross-environment compatibility
const _global = globalThis as any;

/**
 * EventTarget polyfill using Node.js EventEmitter
 * This mimics the browser's EventTarget API
 */
class NodeEventTarget {
  private _listeners: Map<string, Set<Function>> = new Map();
  
  addEventListener(type: string, listener: Function, options?: any): void {
    if (!this._listeners.has(type)) {
      this._listeners.set(type, new Set());
    }
    this._listeners.get(type)!.add(listener);
  }
  
  removeEventListener(type: string, listener: Function): void {
    const listeners = this._listeners.get(type);
    if (listeners) {
      listeners.delete(listener);
    }
  }
  
  dispatchEvent(event: { type: string }): boolean {
    const listeners = this._listeners.get(event.type);
    if (listeners) {
      listeners.forEach(listener => listener(event));
    }
    return true;
  }
}

// ============================================
// POLYFILL: WebRTC APIs (from @roamhq/wrtc)
// ============================================
_global.RTCPeerConnection = wrtc.RTCPeerConnection;
_global.RTCSessionDescription = wrtc.RTCSessionDescription;
_global.RTCIceCandidate = wrtc.RTCIceCandidate;
_global.MediaStream = wrtc.MediaStream;
_global.MediaStreamTrack = wrtc.MediaStreamTrack;
_global.RTCRtpReceiver = wrtc.RTCRtpReceiver;
_global.RTCRtpSender = wrtc.RTCRtpSender;

// ============================================
// POLYFILL: WebSocket
// ============================================
_global.WebSocket = WebSocket;

// ============================================
// POLYFILL: navigator
// ============================================
const navigatorPolyfill = {
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  platform: 'MacIntel',
  language: 'en-US',
  languages: ['en-US', 'en'],
  onLine: true,
  connection: undefined,
  mediaDevices: {
    getUserMedia: async () => new wrtc.MediaStream(),
    enumerateDevices: async () => [],
    getDisplayMedia: async () => new wrtc.MediaStream(),
  },
  permissions: {
    query: async () => ({ state: 'granted' }),
  },
};

Object.defineProperty(_global, 'navigator', {
  value: navigatorPolyfill,
  writable: true,
  configurable: true,
});

// ============================================
// POLYFILL: document
// ============================================
const documentEventTarget = new NodeEventTarget();

const documentPolyfill = Object.create(documentEventTarget, {
  addEventListener: {
    value: documentEventTarget.addEventListener.bind(documentEventTarget),
    writable: true,
    configurable: true,
  },
  removeEventListener: {
    value: documentEventTarget.removeEventListener.bind(documentEventTarget),
    writable: true,
    configurable: true,
  },
  dispatchEvent: {
    value: documentEventTarget.dispatchEvent.bind(documentEventTarget),
    writable: true,
    configurable: true,
  },
  createElement: {
    value: (tag: string) => {
      const element: any = new NodeEventTarget();
      element.tagName = tag.toUpperCase();
      element.play = () => Promise.resolve();
      element.pause = () => {};
      element.load = () => {};
      element.srcObject = null;
      element.src = '';
      element.muted = false;
      element.volume = 1;
      element.autoplay = false;
      element.controls = false;
      element.setAttribute = () => {};
      element.getAttribute = () => null;
      element.style = {};
      element.appendChild = () => element;
      element.removeChild = () => {};
      return element;
    },
    writable: true,
    configurable: true,
  },
  getElementById: { value: () => null, writable: true, configurable: true },
  querySelector: { value: () => null, writable: true, configurable: true },
  querySelectorAll: { value: () => [], writable: true, configurable: true },
  body: { 
    value: { appendChild: () => {}, removeChild: () => {} }, 
    writable: true, 
    configurable: true 
  },
  visibilityState: { value: 'visible', writable: true, configurable: true },
  hidden: { value: false, writable: true, configurable: true },
  documentElement: { 
    value: { style: {} }, 
    writable: true, 
    configurable: true 
  },
});

Object.defineProperty(_global, 'document', {
  value: documentPolyfill,
  writable: true,
  configurable: true,
});

// ============================================
// POLYFILL: window
// ============================================
const windowEventTarget = new NodeEventTarget();

const windowPolyfill: any = Object.create(windowEventTarget, {
  addEventListener: {
    value: windowEventTarget.addEventListener.bind(windowEventTarget),
    writable: true,
    configurable: true,
  },
  removeEventListener: {
    value: windowEventTarget.removeEventListener.bind(windowEventTarget),
    writable: true,
    configurable: true,
  },
  dispatchEvent: {
    value: windowEventTarget.dispatchEvent.bind(windowEventTarget),
    writable: true,
    configurable: true,
  },
});

// Add additional window properties
windowPolyfill.RTCPeerConnection = wrtc.RTCPeerConnection;
windowPolyfill.RTCSessionDescription = wrtc.RTCSessionDescription;
windowPolyfill.RTCIceCandidate = wrtc.RTCIceCandidate;
windowPolyfill.MediaStream = wrtc.MediaStream;
windowPolyfill.WebSocket = WebSocket;
windowPolyfill.document = documentPolyfill;
windowPolyfill.navigator = navigatorPolyfill;
windowPolyfill.location = {
  protocol: 'https:',
  hostname: 'localhost',
  href: 'https://localhost',
  origin: 'https://localhost',
};
windowPolyfill.setTimeout = setTimeout;
windowPolyfill.clearTimeout = clearTimeout;
windowPolyfill.setInterval = setInterval;
windowPolyfill.clearInterval = clearInterval;
windowPolyfill.performance = { now: () => Date.now() };
windowPolyfill.crypto = {
  getRandomValues: (arr: Uint8Array) => {
    for (let i = 0; i < arr.length; i++) {
      arr[i] = Math.floor(Math.random() * 256);
    }
    return arr;
  },
  subtle: {},
};
windowPolyfill.requestAnimationFrame = (cb: Function) => setTimeout(cb, 16);
windowPolyfill.cancelAnimationFrame = clearTimeout;
windowPolyfill.self = windowPolyfill;

Object.defineProperty(_global, 'window', {
  value: windowPolyfill,
  writable: true,
  configurable: true,
});

// Make window.self reference itself
windowPolyfill.self = windowPolyfill;

// ============================================
// POLYFILL: AudioContext
// ============================================
class MockAudioContext extends NodeEventTarget {
  sampleRate = 48000;
  state = 'running';
  destination = {};
  
  createMediaStreamSource() { 
    return { connect: () => {}, disconnect: () => {} }; 
  }
  createScriptProcessor() { 
    return { connect: () => {}, disconnect: () => {}, onaudioprocess: null }; 
  }
  createGain() {
    return { connect: () => {}, disconnect: () => {}, gain: { value: 1 } };
  }
  createAnalyser() {
    return { connect: () => {}, disconnect: () => {}, fftSize: 0 };
  }
  close() { return Promise.resolve(); }
  resume() { return Promise.resolve(); }
  suspend() { return Promise.resolve(); }
}

_global.AudioContext = MockAudioContext;
_global.webkitAudioContext = MockAudioContext;

// ============================================
// POLYFILL: requestAnimationFrame
// ============================================
_global.requestAnimationFrame = (callback: Function) => setTimeout(callback, 16);
_global.cancelAnimationFrame = clearTimeout;

// ============================================
// POLYFILL: ResizeObserver (used by some libs)
// ============================================
_global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// ============================================
// POLYFILL: IntersectionObserver
// ============================================
_global.IntersectionObserver = class IntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// ============================================
// POLYFILL: MutationObserver
// ============================================
_global.MutationObserver = class MutationObserver {
  observe() {}
  disconnect() {}
  takeRecords() { return []; }
};

// ============================================
// POLYFILL: self (alias for window in browsers)
// ============================================
_global.self = windowPolyfill;

console.log('[Polyfills] Browser polyfills for Node.js initialized');
console.log('[Polyfills] document.addEventListener:', typeof documentPolyfill.addEventListener);
console.log('[Polyfills] window.addEventListener:', typeof windowPolyfill.addEventListener);

export {};
