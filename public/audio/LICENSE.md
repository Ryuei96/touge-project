# 音源の出典とライセンス

このフォルダの音源は Stunt Rally（https://github.com/stuntrally/stuntrally）の `data/sounds/` から取得し、
Ogg Vorbis に変換したもの。Stunt Rally のコードは GPL-3.0 だが、音源は個別のライセンスに従う
（`data/sounds/_sounds.txt`, `data/sounds/_crash.txt` に基づく）。個人利用の範囲で使用。
公開配布する場合は各ライセンス（表示・継承）の条件に従うこと。

| ファイル | 元ファイル | 出典 | ライセンス |
| --- | --- | --- | --- |
| engines_engine0/1/3/7.ogg | engines/engine*.wav | VDrift（https://vdrift.net/） | VDrift データ（GPL-3.0 / CC BY-SA 3.0） |
| surface_tire_squeal_05/10/20.ogg | surface/tire_squeal_*.wav | VDrift | 同上 |
| surface_gravel_10.ogg | surface/gravel_10.wav | VDrift | 同上 |
| vehicle_wind.ogg | vehicle/wind.wav | VDrift | 同上 |
| vehicle_bump_front1.ogg | vehicle/bump_front1.wav | VDrift | 同上 |
| crash_01/03/06.ogg, crash_scrap.ogg, crash_screech.ogg | crash/*.wav | Halleck（freesound.org、Stunt Rally が編集） | CC BY-SA 3.0 |

## BGM

| ファイル | 曲 | アーティスト | 取得元 | 備考 |
| --- | --- | --- | --- | --- |
| bgm_goldrunner.ogg | Goldrunner (Maccie Pimp-Me-Up-Mix) | Scyphe | Phaser 3 examples リポジトリ（public/3.55/assets/audio） | Jamendo 系の CC 楽曲として Phaser のサンプルで配布されているもの。元のライセンス条項（CC BY / BY-NC 等）はリポジトリに明記がないため、個人利用に限定する |
| bgm_hardcore_power.ogg | Hardcore Power (We Believe In Goa Remix) | Dafunk | 同上 | 冒頭 150 秒に切り出し、フェードアウト。同上 |

チェックポイント音・シフト音・合成 BGM（ユーロビート風 / フォンク風）は Web Audio で合成している（素材なし）。
