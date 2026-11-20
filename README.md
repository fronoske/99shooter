# くくシューター

小学2年生向けの、九九を学べるスマートフォン向けブラウザゲームです。

上から降りてくる敵が九九の問題（例: `8 × 9`）を持っています。画面下に並んだ玉から答えの数字を選んでタップすると、玉が敵めがけて飛んでいき、正解なら敵を倒せます。敵が防衛ラインまで降りてくるとゲームオーバー、規定数（20 匹）倒すとステージクリアです。

**遊ぶ**: https://fronoske.github.io/99shooter/ （スマートフォンのブラウザで開いてください）

## 遊び方

1. タイトル画面の「スタート」でゲーム開始（「せってい」で、むずかしさ、効果音・BGM の音量（6 段階）、バイブレーションを変えられる）
2. 敵の九九の答えになっている玉をタップして投げる
   - 答えが合う敵がいれば命中して、玉も敵も消える
   - 合う敵がいなければ、玉は素通りして画面外に消える
   - 玉が飛んでいる間は次の玉を投げられない
3. 高い位置で倒すほど高得点。ステージが進むと敵が速く・多くなり、得点も上がる
4. 画面の上のバー（ステージ・得点の帯）をタップするとポーズ。ポーズ画面から「つづける」「やめる」を選べる

## 実行環境の準備

### 必要なもの

- [Node.js](https://nodejs.org/) 20 以上（開発時は v24.22.1 で確認）
- npm（Node.js に同梱。開発時は 11.19.1 で確認）

### セットアップ

プロジェクトのフォルダで依存パッケージをインストールします。

```powershell
npm install
```

## 開発サーバーで遊ぶ

```powershell
npm run dev
```

表示された `Local` の URL（例: `http://localhost:5173/`）を PC のブラウザで開きます。

スマートフォンで試すときは、PC とスマートフォンを同じ Wi-Fi に接続し、表示された `Network` の URL（例: `http://192.168.x.x:5173/`）をスマートフォンのブラウザで開きます。つながらない場合は、Windows ファイアウォールで Node.js の通信が許可されているか確認してください。

## ビルド（公開用ファイルの作成）

```powershell
npm run build
```

`dist/` に静的ファイルが出力されます。`dist/` の中身を任意の Web サーバー（GitHub Pages など）に置けば遊べます。ビルド結果の確認は次のコマンドで行えます。

```powershell
npm run preview
```

## 公開（GitHub Pages）

`main` ブランチに push すると、GitHub Actions（`.github/workflows/deploy.yml`）が テスト → ビルド → 公開 を自動で行います。テストかビルドが失敗したときは公開しません。

- 公開先: https://fronoske.github.io/99shooter/
- 実行状況はリポジトリの「Actions」タブで確認できます
- 手動で公開し直すときは、「Actions」タブの「Deploy to GitHub Pages」から「Run workflow」を押します

別のリポジトリで同じように公開するときは、リポジトリの「Settings」→「Pages」で、公開元（Source）を「GitHub Actions」にします。

## テスト

```powershell
npm test
```

型チェックのみ行う場合:

```powershell
npm run typecheck
```

## ゲームバランスの調整

難易度ごとの補正（`DIFFICULTY`）、敵の問題を手持ちの玉に合わせる確率（`SPAWN`）、敵の速さ・出現間隔・同時出現数・出題する段、玉の数・正解玉の出現確率、スコアの計算式のパラメータは、すべて [src/config.ts](src/config.ts) で調整できます。

## ディレクトリ構成

| パス | 内容 |
| --- | --- |
| `src/config.ts` | 調整用パラメータ |
| `src/settings.ts` | 設定の保存・読み込み |
| `src/game/` | ゲームロジック（進行、玉の生成、問題、スコア、レイアウト） |
| `src/render/` | Canvas への描画 |
| `src/ui/` | ボタンの配置と当たり判定（タイトル・せってい画面） |
| `src/audio/` | BGM・効果音（Web Audio で合成。曲のデータは `music.ts`、鳴らす部分は `engine.ts`）とバイブレーション |
| `src/main.ts` | 起動処理・入力処理・ゲームループ |
| `test/` | ユニットテスト（Vitest） |
| `.github/workflows/deploy.yml` | GitHub Pages への自動公開 |
| `docs/requirements.md` | 要件定義 |
| `docs/presentation.md` | 演出設計（見た目・アニメーション・音） |
| `docs/custom-images.md` | キャラクター画像の差し替え仕様 |
| `dist/` | ビルド結果（自動生成） |
