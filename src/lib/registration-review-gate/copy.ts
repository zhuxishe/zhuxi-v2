export function registrationReviewCopy(locale: string) {
  return locale === "ja" ? {
    title: "参加済みのイベントを評価してください",
    description: "以下の各イベントで、あなた自身が対象者1人に評価を送信すると、新しいイベントに申し込めます。相手からの評価を待つ必要はありません。",
    review: "評価する", cancel: "閉じる", back: "戻る", retry: "再試行", recheck: "評価済み・再確認",
    checking: "確認中…", failed: "評価の完了状況を確認できませんでした。もう一度お試しください。",
    returnToRegistration: "申込画面に戻る", ended: "終了",
  } : {
    title: "请先完成已结束活动的评分",
    description: "请在以下每场活动中，由你本人完成对任意一位可评价对象的评分，再报名新活动。无需等待对方评分。",
    review: "去评分", cancel: "暂不评分", back: "返回", retry: "重试", recheck: "已完成，重新检查",
    checking: "正在检查…", failed: "暂时无法确认评分完成情况，请重试。",
    returnToRegistration: "返回原活动报名", ended: "结束时间",
  }
}
