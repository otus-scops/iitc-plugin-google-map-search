# IITC Plugin: Google Maps Search (Standard Integration)

IITC (Ingress Intel Total Conversion) の検索ボックスにおいて、GoogleマップのURL（短縮URL含む）を貼り付けるだけで、その位置へ移動または検索を実行できるようにするプラグインです。
PCおよびモバイル版IITCの両方に対応しています。

## 特徴

* **多様なURL解析**: `google.com/maps` や `goo.gl` などの短縮URLに含まれる座標情報を解析します。
* **自動住所検索**: URLに座標が含まれていない場合（店名や住所の共有など）、URLから住所を抽出し、自動的にIITC標準の検索機能（Nominatim等）を実行します。
* **住所クリーニング機能**:
    * 全角英数字・記号の半角化
    * 郵便番号（〒xxx-xxxx）の自動除去
    * 「丁目」表記のハイフン化
    * 建物名や店名の自動カット（住所部分のみを検索）
* **モバイル対応**: モバイル版IITCにおける画面切り替えエラーを回避し、スムーズに地図へ移動します。

## 使い方

1.  Googleマップで場所やピンの共有URLをコピーします。
2.  IITC右上の「Search location...」入力欄にURLを貼り付けます。
3.  以下のいずれかの動作が行われます：
    * **座標がある場合**: 検索候補に「Google Maps Coordinates」が表示されます。選択（Enter）するとその位置へジャンプします。
    * **住所のみの場合**: 自動的に住所部分が抽出され、IITCの標準検索が実行されます（Nominatim等の結果リストが表示されます）。

## インストール方法

1.  [Tampermonkey](https://www.tampermonkey.net/) などのユーザースクリプトマネージャーをブラウザにインストールします。
2.  `iitc-plugin-google-maps-search.user.js` をインストールします。
    * **注意**: 初回実行時に、短縮URLを展開するために外部ドメイン（google.comなど）へのアクセス許可を求めるポップアップが表示される場合があります。「常に許可」を選択してください。

## ライセンス

[Apache License, Version 2.0](http://www.apache.org/licenses/LICENSE-2.0)

Copyright (c) 2026 otusscops
