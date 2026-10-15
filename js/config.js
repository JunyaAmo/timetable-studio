// 編集する場所: ロゴ・テーマ・空き時間圧縮ルール・予定
export const config = {
  brand: { name: "STUDIO / 01", logo: "./assets/logo.svg" },
  theme: { background: "#0b111b", accent: "#73e0c5" },
  timeline: {
    // 間隔が60分以上のとき、その区間だけ30分相当の幅で描画
    compressionThresholdMinutes: 60,
    compressedGapDisplayMinutes: 30,
    // 最小幅 (比率) を設けるための描画処理は app.js 側
  },
  animation: { particleCount: 48, speed: 0.35, opacity: 0.24 },
  // 毎日繰り返す試作データ。時刻はそのPCのローカル時刻。
  // 予定がない日を試す場合は [] にする。
  schedules: [
    { id: "a", start: "09:00", end: "10:00", title: "朝のミーティング", color: "#6a9bd4" },
    { id: "b", start: "10:30", end: "12:00", title: "制作・リサーチ", color: "#4fa6b0" },
    { id: "c", start: "15:00", end: "17:00", title: "プロジェクト作業", color: "#73e0c5" },
    { id: "d", start: "18:00", end: "19:00", title: "レビュー", color: "#a49ee8" }
  ]
};
