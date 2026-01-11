// ==UserScript==
// @id             iitc-plugin-google-maps-search@otusscops
// @name           IITC Plugin: Google Maps Search (Standard Integration)
// @category       Search
// @version        2.1.0
// @namespace      https://github.com/otus-scops/iitc-plugin-google-maps-search
// @description    GoogleマップのURLから座標を特定、または住所を抽出してIITC標準検索を自動実行します。
// @downloadURL    https://github.com/otus-scops/iitc-plugin-google-map-search/raw/refs/heads/main/iitc-plugin-google-maps-search.user.js
// @updateURL      https://github.com/otus-scops/iitc-plugin-google-map-search/raw/refs/heads/main/iitc-plugin-google-maps-search.user.js
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

/**
 * Copyright 2026 otusscops
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

(function () {
  "use strict";

  // --- 1. Tampermonkey Sandbox Scope ---

  function setupBridge() {
    if (!unsafeWindow.plugin) unsafeWindow.plugin = {};
    if (!unsafeWindow.plugin.googleMapsSearch) unsafeWindow.plugin.googleMapsSearch = {};

    const bridge = unsafeWindow.plugin.googleMapsSearch;

    // 短縮URL展開機能 (GM_xmlhttpRequestを利用)
    bridge.expandUrl = function (url, callback) {
      // console.log('[GMapSearch] Requesting expansion for:', url);
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

    // 座標パターン定義
    const COORD_PATTERNS = [
      /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,       // !3dLat!4dLng
      /[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/,      // q=Lat,Lng
      /search\/(-?\d+\.\d+),\s*(-?\d+\.\d+)/, // /search/Lat,Lng
      /[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/,     // ll=Lat,Lng
      /@(-?\d+\.\d+),(-?\d+\.\d+)/            // @Lat,Lng
    ];

    // 住所抽出パターン定義
    const QUERY_PATTERNS = [
      /[?&]q=([^&]+)/,
      /search\/([^/]+)/
    ];

    // 全角→半角正規化ユーティリティ
    self.toHalfWidth = function(str) {
      if (!str) return "";
      return str
        .replace(/[Ａ-Ｚａ-ｚ０-９]/g, function(s) {
          return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
        })
        .replace(/[－−]/g, "-")      // ハイフン正規化
        .replace(/\u3000/g, " ");    // 全角スペース→半角スペース
    };

    // 座標抽出ロジック
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

    // 住所抽出ロジック
    self.extractAddress = function (url) {
      let decodedUrl = url;
      try { decodedUrl = decodeURIComponent(url); } catch (e) {}

      // 座標が含まれる場合は住所抽出を行わない（座標優先）
      if (self.parseCoordinates(url)) return null;

      for (const pattern of QUERY_PATTERNS) {
        const match = decodedUrl.match(pattern);
        if (match && match.length >= 2) {
          let rawAddress = match[1].replace(/\+/g, ' ');
          
          // 1. 正規化
          let normalized = self.toHalfWidth(rawAddress);

          // 2. 郵便番号除去 (〒xxx-xxxx または xxx-xxxx)
          let addressNoZip = normalized.replace(/(\s|^)(〒)?\d{3}-\d{4}(\s|$)/g, ' ').trim();

          // 3. 「丁目」をハイフンに置換
          let addressNoChome = addressNoZip.replace(/丁目/g, '-');

          // 4. スペース以降（建物名など）をカット
          let cleanAddress = addressNoChome.split(' ')[0];

          return cleanAddress;
        }
      }
      return null;
    };

    // IITC標準検索を実行する関数
    self.triggerStandardSearch = function(term) {
        if (!term) return;

        // 入力欄に値をセット
        const input = document.getElementById('search');
        if (input) {
            input.value = term;
        }

        // UI反映待ちのために少し遅延実行
        setTimeout(function() {
            // 1. IITC APIの直接実行を試みる
            if (typeof window.search === 'object' && typeof window.search.doSearch === 'function') {
                window.search.doSearch(term);
                return;
            }
            if (window.IITC && window.IITC.search && typeof window.IITC.search.doSearch === 'function') {
                window.IITC.search.doSearch(term);
                return;
            }

            // 2. jQuery等でのイベント発火 (APIが見つからない場合)
            if (window.$ && input) {
                const jqInput = window.$(input);
                const ev = window.$.Event('keypress');
                ev.which = 13;
                ev.keyCode = 13;
                ev.key = 'Enter';
                jqInput.trigger(ev);
                
                // 念のためフォーム送信もトリガー
                const form = jqInput.closest('form');
                if (form.length > 0) form.submit();
            }
        }, 10);
    };

    // モバイル用：強制マップ表示フォールバック
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

    // 検索結果追加（座標用）
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
              // モバイル版の画面切り替え処理
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

    // URL処理のメインロジック
    self.processUrl = function(url, query, stepName) {
        // 1. 座標があれば最優先で結果表示
        const latLng = self.parseCoordinates(url);
        if (latLng) {
            self.addResultToQuery(latLng, query, stepName);
            return;
        }

        // 2. 座標がなく、住所があれば標準検索へ渡す
        const address = self.extractAddress(url);
        if (address) {
            self.triggerStandardSearch(address);
        }
    };

    // 検索フック
    self.onSearch = function (query) {
      const term = query.term.trim();
      if (!term) return;
      
      // URL形式でなければ何もしない（通常の検索に任せる）
      if (!/^https?:\/\//.test(term)) return;

      // URL処理開始
      self.processUrl(term, query, "Direct URL");
      
      // 短縮URLの場合は展開してから再チェック
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

  // --- 実行フロー ---
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
