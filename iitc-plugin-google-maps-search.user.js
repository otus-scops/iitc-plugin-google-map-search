// ==UserScript==
// @id             iitc-plugin-google-maps-search@otusscops
// @name           IITC Plugin: Google Maps Search
// @category       Search
// @version        2.1.0
// @namespace      https://github.com/otus-scops/iitc-plugin-google-maps-search
// @description    GoogleマップのURLから座標を特定、または住所を抽出してIITC標準検索を自動実行します。
// @include        https://*.ingress.com/*
// @include        http://*.ingress.com/*
// @match          https://*.ingress.com/*
// @match          http://*.ingress.com/*
// @grant          GM_xmlhttpRequest
// @grant          unsafeWindow
// @connect        google.com
// @connect        goo.gl
// @connect        googleusercontent.com
// @license        Apache-2.0
// ==/UserScript==

(function () {
  "use strict";

  // --- 1. Tampermonkey Sandbox Scope ---

  function setupBridge() {
    if (!unsafeWindow.plugin) unsafeWindow.plugin = {};
    if (!unsafeWindow.plugin.googleMapsSearch) unsafeWindow.plugin.googleMapsSearch = {};

    const bridge = unsafeWindow.plugin.googleMapsSearch;

    bridge.expandUrl = function (url, callback) {
      console.log('[GMapSearch] Requesting expansion for:', url);
      GM_xmlhttpRequest({
        method: "HEAD",
        url: url,
        followRedirect: true,
        onload: function (response) {
          const resolvedUrl = response.finalUrl || url;
          callback(resolvedUrl);
        },
        onerror: function (err) {
          callback(url);
        }
      });
    };
  }

  // --- 2. Page Scope ---

  const wrapper = function (plugin_info) {
    if (typeof window.plugin !== "function") window.plugin = function () {};

    plugin_info.buildName = "iitc-plugin-google-maps-search";
    plugin_info.dateTimeVersion = "20260113180000";
    plugin_info.pluginId = "google-maps-search";

    if (typeof window.plugin.googleMapsSearch === "undefined") {
      window.plugin.googleMapsSearch = {};
    }
    const self = window.plugin.googleMapsSearch;

    const COORD_PATTERNS = [
      /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,
      /[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/,
      /search\/(-?\d+\.\d+),\s*(-?\d+\.\d+)/,
      /[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/,
      /@(-?\d+\.\d+),(-?\d+\.\d+)/
    ];

    const QUERY_PATTERNS = [
      /[?&]q=([^&]+)/,
      /search\/([^/]+)/
    ];

    self.toHalfWidth = function(str) {
      if (!str) return "";
      return str
        .replace(/[Ａ-Ｚａ-ｚ０-９]/g, function(s) {
          return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
        })
        .replace(/[－−]/g, "-")
        .replace(/\u3000/g, " ");
    };

    self.parseCoordinates = function (url) {
      let decodedUrl = url;
      try { decodedUrl = decodeURIComponent(url); } catch (e) {}
      decodedUrl = self.toHalfWidth(decodedUrl);

      for (const pattern of COORD_PATTERNS) {
        const match = decodedUrl.match(pattern);
        if (match && match.length >= 3) {
          const lat = parseFloat(match[1]);
          const lng = parseFloat(match[2]);
          if (!isNaN(lat) && !isNaN(lng) && Math.abs(lat) <= 90) {
            return L.latLng(lat, lng);
          }
        }
      }
      return null;
    };

    self.extractAddress = function (url) {
      let decodedUrl = url;
      try { decodedUrl = decodeURIComponent(url); } catch (e) {}

      if (self.parseCoordinates(url)) return null;

      for (const pattern of QUERY_PATTERNS) {
        const match = decodedUrl.match(pattern);
        if (match && match.length >= 2) {
          let rawAddress = match[1].replace(/\+/g, ' ');
          let normalized = self.toHalfWidth(rawAddress);
          let addressNoZip = normalized.replace(/(\s|^)(〒)?\d{3}-\d{4}(\s|$)/g, ' ').trim();
          let addressNoChome = addressNoZip.replace(/丁目/g, '-');
          let cleanAddress = addressNoChome.split(' ')[0];
          return cleanAddress;
        }
      }
      return null;
    };

    // --- 検索実行ロジック (改修版) ---
    self.triggerStandardSearch = function(term) {
        if (!term) return;

        console.log('[GMapSearch] Triggering search for:', term);

        // 入力欄に値をセット
        const input = document.getElementById('search');
        if (input) {
            input.value = term;
        }

        // 検索実行（少し待ってから実行することでUIの競合を防ぐ）
        setTimeout(function() {
            // 1. IITC標準関数 (window.search.doSearch)
            if (typeof window.search === 'object' && typeof window.search.doSearch === 'function') {
                console.log('[GMapSearch] Calling window.search.doSearch');
                window.search.doSearch(term);
                return;
            }

            // 2. jQueryイベントによるEnterキー連打
            if (window.$ && input) {
                console.log('[GMapSearch] Triggering jQuery events');
                const jqInput = window.$(input);

                // Enterキーイベントを作成
                const ev = window.$.Event('keypress');
                ev.which = 13;
                ev.keyCode = 13;
                ev.key = 'Enter';
                jqInput.trigger(ev);

                // 念のため submit も試みる
                const form = jqInput.closest('form');
                if (form.length > 0) {
                    form.submit();
                }
            }
        }, 10);
    };

    self.forceMobileMapDisplay = function() {
        try {
            if (window.$) {
                window.$('#scrollwrapper').hide();
                window.$('#updatestatus').show();
                window.$('#map').css('visibility', 'visible');
                window.$('.ui-dialog-content').dialog('close');
            }
        } catch(e) {
            console.log('[GMapSearch] Force map display failed:', e);
        }
    };

    self.addResultToQuery = function(latLng, query, note) {
        if (!latLng) return;
        query.addResult({
          title: "Google Maps Coordinates",
          description: `Jump to: ${latLng.lat.toFixed(6)}, ${latLng.lng.toFixed(6)} (${note})`,
          position: latLng,
          icon: null,
          onSelected: function (result, event) {
            if (window.map) {
              window.map.setView(result.position, 17);
              if (window.isSmartphone) {
                let switched = false;
                if (typeof window.show === 'function') {
                    try { window.show("map"); switched = true; } catch (e) {}
                }
                if (!switched) self.forceMobileMapDisplay();
              }
            }
            return true;
          },
        });
    };

    self.processUrl = function(url, query, stepName) {
        const latLng = self.parseCoordinates(url);
        if (latLng) {
            self.addResultToQuery(latLng, query, stepName);
            return;
        }

        const address = self.extractAddress(url);
        if (address) {
            self.triggerStandardSearch(address);
        }
    };

    self.onSearch = function (query) {
      const term = query.term.trim();
      if (!term) return;
      if (!/^https?:\/\//.test(term)) return;

      self.processUrl(term, query, "Direct URL");

      if (window.plugin.googleMapsSearch.expandUrl) {
          window.plugin.googleMapsSearch.expandUrl(term, function(expandedUrl) {
              if (expandedUrl && expandedUrl !== term) {
                  self.processUrl(expandedUrl, query, "Expanded URL");
              }
          });
      }
    };

    self.init = function () {
      if (window.addHook) {
        window.addHook("search", self.onSearch);
      }
    };

    const setup = self.init;
    setup.info = plugin_info;
    if (!window.bootPlugins) window.bootPlugins = [];
    window.bootPlugins.push(setup);
    if (window.iitcLoaded && typeof setup === "function") {
      setup();
    }
  };

  setupBridge();
  const script = document.createElement("script");
  const info = {};
  if (typeof GM_info !== "undefined" && GM_info && GM_info.script) {
    info.script = {
      version: GM_info.script.version,
      name: GM_info.script.name,
      description: GM_info.script.description,
    };
  }
  script.appendChild(document.createTextNode(`(${wrapper})(${JSON.stringify(info)});`));
  (document.body || document.head || document.documentElement).appendChild(script);
})();
