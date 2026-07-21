(function () {
  'use strict';

  var RPC_URL = 'https://api.8-219-199-207.sslip.io/bsc';
  var PATCH_FLAG = '__gpcRpcBridgePatched__';
  var requestId = 0;

  function rpcError(payload) {
    var error = new Error(payload.message || 'RPC call failed');
    error.code = payload.code;
    error.data = payload.data;
    error.isRpcResponse = true;
    return error;
  }

  async function callProxy(args) {
    var response = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: ++requestId,
        method: args.method,
        params: args.params || [],
      }),
      cache: 'no-store',
      credentials: 'omit',
    });

    if (!response.ok) {
      throw new Error('RPC proxy returned HTTP ' + response.status);
    }

    var payload = await response.json();
    if (payload.error) throw rpcError(payload.error);
    return payload.result;
  }

  function patchProvider(provider) {
    if (!provider || typeof provider.request !== 'function' || provider[PATCH_FLAG]) {
      return provider;
    }

    var walletRequest = provider.request.bind(provider);
    try {
      Object.defineProperty(provider, PATCH_FLAG, { value: true });
      provider.request = async function (args) {
        if (args && args.method === 'eth_call') {
          try {
            return await callProxy(args);
          } catch (error) {
            if (error && error.isRpcResponse) throw error;
            console.warn('[GPC RPC] Proxy unavailable; falling back to wallet RPC.', error);
          }
        }
        return walletRequest(args);
      };
    } catch (error) {
      console.warn('[GPC RPC] Unable to patch wallet provider.', error);
    }
    return provider;
  }

  patchProvider(window.ethereum);
  var attempts = 0;
  var timer = window.setInterval(function () {
    patchProvider(window.ethereum);
    attempts += 1;
    if (attempts >= 100) window.clearInterval(timer);
  }, 100);
})();
