/* 港区戦記 App版ネイティブブリッジ
 * Web版(index.html)には一切手を入れず、App版でのみ読み込む追加レイヤー。
 * 役割: 1) 途中セーブ/再開  2) 結末の履歴保存  3) ネイティブシェア  4) 触覚フィードバック
 * Capacitorプラグインが無い環境(ブラウザ確認時)でも壊れないよう全てフォールバック付き。
 */
(function () {
  'use strict';
  var SAVE_KEY = 'minato-senki-app:save:v1';
  var HIST_KEY = 'minato-senki-app:history:v1';
  var cap = window.Capacitor || null;
  function plugin(name) {
    try { return cap && cap.Plugins && cap.Plugins[name] ? cap.Plugins[name] : null; } catch (e) { return null; }
  }
  function isNative() { try { return !!(cap && cap.isNativePlatform && cap.isNativePlatform()); } catch (e) { return false; } }

  /* ---------- 触覚: 主要ボタンのタップで軽く返す ---------- */
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest && ev.target.closest('button, .act, .chip, a.btn');
    if (!t) return;
    var h = plugin('Haptics');
    if (h && h.impact) { h.impact({ style: 'LIGHT' }).catch(function () {}); }
    else if (navigator.vibrate) { try { navigator.vibrate(8); } catch (e) {} }
  }, true);

  /* ---------- 途中セーブ: ゲーム状態 G を定期保存 ---------- */
  function snapshot() {
    try {
      /* G はゲーム本体スクリプトの let 変数(グローバル字句スコープ) */
      if (typeof G === 'undefined' || !G || G.done) return;
      var s = JSON.stringify(G);
      if (s && s.length < 400000) localStorage.setItem(SAVE_KEY, s);
    } catch (e) { /* 循環参照等があれば黙って諦める */ }
  }
  setInterval(snapshot, 3000);
  document.addEventListener('visibilitychange', function () { if (document.hidden) snapshot(); });

  function loadSave() {
    try {
      var s = localStorage.getItem(SAVE_KEY);
      return s ? JSON.parse(s) : null;
    } catch (e) { return null; }
  }
  function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} }

  /* ---------- 結末履歴: 総括画面が出たらタイトルを記録 ---------- */
  function loadHist() {
    try { return JSON.parse(localStorage.getItem(HIST_KEY) || '[]'); } catch (e) { return []; }
  }
  function recordEnding() {
    var el = document.querySelector('.ending-title');
    if (!el) return;
    var title = (el.textContent || '').trim();
    if (!title) return;
    var hist = loadHist();
    var last = hist[0];
    if (last && last.title === title && Date.now() - last.at < 60000) return; // 同一総括の重複防止
    hist.unshift({ title: title, at: Date.now() });
    try { localStorage.setItem(HIST_KEY, JSON.stringify(hist.slice(0, 30))); } catch (e) {}
    clearSave(); // 総括まで来たら途中セーブは破棄
  }
  var mo = new MutationObserver(function () { recordEnding(); });
  function startObserve() {
    if (document.body) mo.observe(document.body, { childList: true, subtree: true });
  }

  /* ---------- シェア: X intent の代わりにネイティブ共有シート ---------- */
  document.addEventListener('click', function (ev) {
    var a = ev.target.closest && ev.target.closest('#share');
    if (!a || !isNative()) return; // Web版では従来のXシェアをそのまま使う
    ev.preventDefault();
    var text = '';
    try {
      var u = new URL(a.href);
      text = u.searchParams.get('text') || document.title;
    } catch (e) { text = document.title; }
    var sh = plugin('Share');
    if (sh && sh.share) {
      sh.share({ title: '港区戦記', text: text, dialogTitle: '結果をシェア' }).catch(function () {});
    } else if (navigator.share) {
      navigator.share({ title: '港区戦記', text: text }).catch(function () {});
    }
  }, true);

  /* ---------- 外部リンク(LINE等)はアプリ内ではなく外部ブラウザで開く ---------- */
  document.addEventListener('click', function (ev) {
    var a = ev.target.closest && ev.target.closest('a[target="_blank"]');
    if (!a || !isNative() || a.id === 'share') return;
    var br = plugin('Browser');
    if (br && br.open) { ev.preventDefault(); br.open({ url: a.href }).catch(function () {}); }
  }, true);

  /* ---------- アプリ用UI: 再開ボタン + 履歴パネル ---------- */
  function injectUI() {
    if (document.getElementById('ms-app-ui')) return;
    var bar = document.createElement('div');
    bar.id = 'ms-app-ui';
    bar.style.cssText = 'position:fixed;right:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:9999;display:flex;gap:8px;';
    var btnCss = 'border:1px solid rgba(0,0,0,.15);background:rgba(28,33,64,.92);color:#fff;border-radius:999px;padding:9px 14px;font-size:13px;font-weight:700;box-shadow:0 2px 10px rgba(0,0,0,.25);cursor:pointer;';
    var histBtn = document.createElement('button');
    histBtn.textContent = '戦記の履歴';
    histBtn.style.cssText = btnCss;
    histBtn.onclick = showHistory;
    bar.appendChild(histBtn);
    var save = loadSave();
    if (save && typeof save.age === 'number') {
      var resumeBtn = document.createElement('button');
      resumeBtn.textContent = save.age + '歳から再開';
      resumeBtn.style.cssText = btnCss + 'background:#b8405e;';
      resumeBtn.onclick = function () {
        try {
          G = save;               // ゲーム本体の状態を差し戻す
          if (typeof renderGame === 'function') renderGame();
          bar.remove();
        } catch (e) { clearSave(); resumeBtn.remove(); }
      };
      bar.appendChild(resumeBtn);
    }
    document.body.appendChild(bar);
  }
  function showHistory() {
    var old = document.getElementById('ms-hist-panel');
    if (old) { old.remove(); return; }
    var hist = loadHist();
    var panel = document.createElement('div');
    panel.id = 'ms-hist-panel';
    panel.style.cssText = 'position:fixed;inset:auto 12px calc(64px + env(safe-area-inset-bottom,0px)) 12px;z-index:10000;background:#fff;color:#1c2140;border:1px solid #dcdbe6;border-radius:10px;padding:14px 16px;box-shadow:0 8px 30px rgba(0,0,0,.3);max-height:50vh;overflow:auto;font-size:14px;';
    if (!hist.length) {
      panel.innerHTML = '<b>戦記の履歴</b><p style="margin:8px 0 0;color:#6a6c82">まだ結末の記録がありません。35歳の総括か結婚まで進むと、ここに残ります。</p>';
    } else {
      panel.innerHTML = '<b>戦記の履歴</b>' + hist.map(function (h) {
        var d = new Date(h.at);
        return '<p style="margin:8px 0 0">' + d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate() + '　' +
          String(h.title).replace(/</g, '&lt;') + '</p>';
      }).join('');
    }
    document.body.appendChild(panel);
  }

  document.addEventListener('DOMContentLoaded', function () { injectUI(); startObserve(); });
  if (document.readyState !== 'loading') { injectUI(); startObserve(); }
})();

/* ---------- App Store版フィルタ: 審査対策で成人向け・犯罪系イベントを除外 ----------
 * Web版(index.html)は無改変のまま、App版でのみイベントプールから外す。
 * 除外: AV出演系 / 薬物系 / 美人局系 / いただき系(極悪パパ活) / 妊娠・中絶系
 * 残す: 卵子凍結・不妊治療(医療テーマ) / 既婚者・慰謝料(テーマのみ) / 成功パターン等
 * イベントは発火時に配列を参照する仕様のため、読み込み直後の除去で十分に効く。
 */
(function () {
  'use strict';
  var BLOCK = {
    av_label: 1, av_career: 1, av_kosatsu: 1, av_kosatsu2: 1, av_leak: 1,
    drug_party: 1, drug_again: 1, drug_busted: 1,
    tsutsu: 1, tsutsu2: 1, tsutsu_busted: 1,
    papakatsu_dark: 1, itadaki_manual: 1, itadaki_obsess: 1, itadaki_busted: 1,
    ninshin: 1, ninshin2: 1, ninshin3: 1
  };
  function strip(arr) {
    if (!arr || !arr.length) return;
    for (var i = arr.length - 1; i >= 0; i--) { if (arr[i] && BLOCK[arr[i].id]) arr.splice(i, 1); }
  }
  try { if (typeof EVENTS !== 'undefined') strip(EVENTS); } catch (e) {}
  try { if (typeof MEVENTS !== 'undefined') strip(MEVENTS); } catch (e) {}
})();

/* ---------- App版UIクリーンアップ: サイト側クロームを除去 ----------
 * Web版ページのヘッダー(Noe結婚設計室ロゴ+サイトナビ)・関連リンク集・
 * フッターは、App内では飛び先が無くブランド表示も不要なため丸ごと外す。
 * ゲームの説明文(nm-about の本文セクション)は残す。Web版は無改変。
 */
(function () {
  'use strict';
  function clean() {
    ['.nm-head', '.nm-crumb', '.nm-rel', '.nm-foot'].forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (el) { el.remove(); });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', clean);
  else clean();
})();

/* ---------- App版スクロール: 選択のたびに画面トップへ戻す ----------
 * Web版はページ内スクロールのまま。App版では一手を選んだら次の画面を
 * 先頭から読めるよう、アクション/イベント選択のクリック後に最上部へ戻す。
 */
(function () {
  'use strict';
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest && ev.target.closest('[data-a], #ev0, #ev1');
    if (!t) return;
    setTimeout(function () {
      try { window.scrollTo({ top: 0, behavior: 'instant' }); } catch (e) { window.scrollTo(0, 0); }
    }, 60);
  }, true);
})();

/* ---------- App版モード: ゲーム開始時に appMode を立てる ----------
 * 本体には App版専用イベント(app_* )が appMode ゲート付きで入っている。
 * Web版ではこのブリッジが無いため一切発火しない。App版では startGame を
 * ラップして G.appMode=true をセットする(セーブデータにもそのまま残る)。
 */
(function () {
  'use strict';
  try {
    if (typeof startGame === 'function' && !startGame.__appWrapped) {
      var orig = startGame;
      var wrapped = function () {
        orig();
        try { if (typeof G !== 'undefined' && G) G.appMode = true; } catch (e) {}
      };
      wrapped.__appWrapped = true;
      startGame = wrapped;
    }
  } catch (e) {}
})();
