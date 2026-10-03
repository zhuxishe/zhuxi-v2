const zh = {
  title: "活动互评", back: "返回参与记录", entry: "评价本场玩家", viewEntry: "查看本场评价", continueEntry: "继续评价",
  intro: "只评价本场活动中实际交流过的玩家，不需要评价所有人。",
  privacy: "评分与评论仅本人和获授权的管理员可查看，不会向对方或其他玩家公开。",
  reviewed: (count: number) => `你已评价 ${count} 位玩家`,
  participants: (count: number) => `${count} 位本场玩家`,
  historyTitle: "我的评价与举报", historyUnavailable: "玩家信息暂不可用", historyCount: (count: number) => `${count} 位玩家`, editReview: "修改评价", editReport: "修改举报", cancelEdit: "取消", saveChanges: "保存修改",
  openActivities: (count: number) => `${count} 场活动待评价`,
  homeDescription: "回顾本场相处体验，选择交流过的玩家留下评价。", homeCta: "查看活动互评", quick: "活动互评",
  opensAt: "开放时间", closesAt: "截止时间", state: { open: "互评进行中", scheduled: "互评尚未开始", closed: "互评已截止", unavailable: "互评暂不可用", paused: "互评已暂停" },
  invalidatedHint: "这条评价已被管理员标记无效，当前不能修改。", closedHint: "当前不能新增或修改评分，你仍可查看本人已提交的内容。", unavailableHint: "本场互评暂不可用，请返回参与记录查看活动信息。",
  search: "检索玩家", searchPlaceholder: "输入姓名或昵称", searchButton: "搜索", clear: "清除", empty: "没有找到符合条件的玩家", emptyHint: "请确认姓名或昵称，或清除关键词查看本场名单。",
  select: "选择玩家", selected: "正在评价", choose: "先选择一位玩家", chooseHint: "点击上方玩家卡片后，在这里填写评分与评论。", unnamed: "未填写姓名", noNickname: "未设置昵称", nickname: "昵称", reviewedBadge: "已评价", unreviewed: "未评价", reportedBadge: "已提交举报",
  score: "本次相处体验", scoreHint: "1–5 分，每档 0.5 分。请按本次实际体验选择。", scoreLabel: (score: number) => `${score.toFixed(1)} 分`, noScore: "请选择评分", scoreLow: "体验较差", scoreHigh: "体验很好",
  comment: "文字评价", optional: "选填", commentPlaceholder: "可以写下本次交流的感受、感谢或建议。", save: "保存评价", update: "更新评价", saving: "保存中…", saved: "评价已保存", updated: "评价已更新", lastSaved: "更新于", editingHint: "截止前可修改评分和评论。",
  report: "举报玩家", reportTitle: "是否举报这位玩家？", reportConfirmDescription: "确认后将展开举报表单。你可以填写具体情况并检查内容，点击提交按钮后才会发送。", reportConfirm: "继续填写举报", cancel: "暂不举报", reportHelp: "遇到不当行为，可以单独举报，无需先给分。", reportPrivate: "举报及补充内容仅本人和获授权的管理员可查看。", reportCategory: "举报类型", reportDetail: "具体举报信息", reportPlaceholder: "请尽量写明发生时间、具体行为和相关情况（10–2000 字）。", reportSubmit: "仅提交举报", reportCombined: "保存评价并提交举报", reportSubmitting: "提交中…", reportSubmitted: "举报已提交", reportView: "查看已提交举报", reportHistory: "本人举报记录", reportStatus: "处理状态", reportSupplement: "补充或更正说明", reportSupplementPlaceholder: "填写需要补充或更正的情况（10–2000 字）。", reportSupplementSubmit: "提交补充", reportSupplementSaved: "补充信息已提交", reportSupplements: "已提交的补充", reportUnavailable: "当前暂不能提交举报或补充信息。", reportHide: "收起举报表单", reportOnlyHint: "选择“仅提交举报”时，不会保存上面的评分或评论。",
  reportSupplementLimit: "本次举报的补充信息已达到上限。", reportStateChanged: "举报处理状态已变化，请刷新后补充或更正。", reportEditHint: "举报待处理时，可以修改类型和内容。", reportUpdated: "举报已更新", reportCorrect: "补充或更正", reportCorrectHint: "已进入处理流程，原内容予以保留。补充或更正后，管理员会重新查看。",
  categories: { harassment: "骚扰或不当接触", privacy: "侵犯隐私", disruption: "扰乱活动或违反规则", other: "其他" },
  reportStates: { pending: "待处理", reviewing: "处理中", resolved: "已处理", dismissed: "已关闭", open: "待处理", in_review: "处理中", closed: "已关闭" },
  previous: "上一页", next: "下一页", page: (page: number, pages: number) => `第 ${page} / ${pages} 页`,
  errors: { rateLimit: "操作较频繁，请稍后再试。", invalid: "请检查填写内容后重试。", score: "请选择 1–5 分的评分，每档为 0.5 分。", comment: "文字评价最多 500 字。", report: "请填写 10–2000 字的具体情况。", conflict: "这条记录已在其他页面更新，请刷新后再修改。", unavailable: "当前互评资格或开放时间已改变，请刷新页面确认。", failed: "提交失败，请稍后重试。", network: "网络异常，请稍后重试。" },
}

const ja: typeof zh = {
  title: "イベントの相互評価", back: "参加記録に戻る", entry: "参加者を評価する", viewEntry: "評価を確認する", continueEntry: "評価を続ける",
  intro: "このイベントで実際に交流した方を評価してください。全員を評価する必要はありません。",
  privacy: "評価とコメントは、ご本人と権限を持つ管理者のみが確認できます。相手やほかの参加者には公開されません。",
  reviewed: (count) => `${count} 人を評価済み`, participants: (count) => `今回の参加者 ${count} 人`, openActivities: (count) => `未評価のイベントが ${count} 件あります`,
  historyTitle: "自分の評価と通報", historyUnavailable: "参加者の情報を表示できません", historyCount: (count) => `${count} 人分`, editReview: "評価を変更", editReport: "通報を変更", cancelEdit: "キャンセル", saveChanges: "変更を保存",
  homeDescription: "一緒に過ごした時間を振り返り、交流した方への評価を残せます。", homeCta: "イベントの評価へ", quick: "相互評価",
  opensAt: "受付開始", closesAt: "受付終了", state: { open: "評価受付中", scheduled: "受付開始前", closed: "評価受付終了", unavailable: "現在利用できません", paused: "評価は一時停止中です" },
  invalidatedHint: "この評価は管理者によって無効とされているため、変更できません。", closedHint: "現在、評価の追加・変更はできません。送信済みの内容は確認できます。", unavailableHint: "現在、このイベントの相互評価は利用できません。参加記録でイベント情報をご確認ください。",
  search: "参加者を検索", searchPlaceholder: "氏名・ニックネームで検索", searchButton: "検索", clear: "クリア", empty: "該当する参加者が見つかりません", emptyHint: "氏名やニックネームを確認するか、検索をクリアしてください。",
  select: "参加者を選ぶ", selected: "評価する相手", choose: "参加者を選んでください", chooseHint: "上の参加者カードを選ぶと、評価とコメントを入力できます。", unnamed: "氏名未登録", noNickname: "ニックネーム未登録", nickname: "ニックネーム", reviewedBadge: "評価済み", unreviewed: "未評価", reportedBadge: "通報済み",
  score: "今回一緒に過ごした印象", scoreHint: "1〜5 点、0.5 点刻みです。今回の実際の体験に基づいて選んでください。", scoreLabel: (score) => `${score.toFixed(1)} 点`, noScore: "点数を選択してください", scoreLow: "よくなかった", scoreHigh: "とてもよかった",
  comment: "コメント", optional: "任意", commentPlaceholder: "交流の感想、お礼や提案などをお書きください。", save: "評価を保存", update: "評価を更新", saving: "保存中…", saved: "評価を保存しました", updated: "評価を更新しました", lastSaved: "更新日時", editingHint: "受付終了までは評価とコメントを変更できます。",
  report: "この参加者を通報", reportTitle: "この参加者を通報しますか？", reportConfirmDescription: "続行すると通報フォームが開きます。内容を入力・確認し、送信ボタンを押すまで送信されません。", reportConfirm: "通報内容を入力する", cancel: "戻る", reportHelp: "不適切な行為があった場合は、点数を付けずに通報できます。", reportPrivate: "通報と補足情報は、ご本人と権限を持つ管理者のみが確認できます。", reportCategory: "通報の種類", reportDetail: "具体的な内容", reportPlaceholder: "日時、具体的な行為や状況を、10〜2000 文字でお書きください。", reportSubmit: "通報のみ送信", reportCombined: "評価を保存して通報を送信", reportSubmitting: "送信中…", reportSubmitted: "通報を送信しました", reportView: "送信した通報を見る", reportHistory: "ご自身の通報記録", reportStatus: "対応状況", reportSupplement: "補足・訂正の内容", reportSupplementPlaceholder: "補足・訂正したい内容をお書きください（10〜2000 文字）。", reportSupplementSubmit: "補足を送信", reportSupplementSaved: "補足情報を送信しました", reportSupplements: "送信済みの補足", reportUnavailable: "現在、通報や補足情報を送信できません。", reportHide: "通報フォームを閉じる", reportOnlyHint: "「通報のみ送信」では、上の評価やコメントは保存されません。",
  reportSupplementLimit: "この通報への補足は上限に達しました。", reportStateChanged: "通報の対応状況が変わりました。ページを再読み込みしてから補足・訂正してください。", reportEditHint: "対応待ちの通報は、種類と内容を変更できます。", reportUpdated: "通報を更新しました", reportCorrect: "補足・訂正する", reportCorrectHint: "対応が始まった通報は元の内容を保持します。補足・訂正を送信すると、管理者が再度確認します。",
  categories: { harassment: "ハラスメント・不適切な接触", privacy: "プライバシーの侵害", disruption: "進行妨害・ルール違反", other: "その他" },
  reportStates: { pending: "対応待ち", reviewing: "確認中", resolved: "対応済み", dismissed: "終了", open: "対応待ち", in_review: "確認中", closed: "終了" },
  previous: "前へ", next: "次へ", page: (page, pages) => `${page} / ${pages} ページ`,
  errors: { rateLimit: "操作が続いています。少し時間を置いてからお試しください。", invalid: "入力内容を確認してください。", score: "1〜5 点を 0.5 点刻みで選んでください。", comment: "コメントは 500 文字以内で入力してください。", report: "具体的な内容を 10〜2000 文字で入力してください。", conflict: "別の画面で記録が更新されました。ページを再読み込みしてから変更してください。", unavailable: "評価の受付状況または参加資格が変わりました。ページを再読み込みしてご確認ください。", failed: "送信できませんでした。しばらくしてからお試しください。", network: "通信エラーが発生しました。しばらくしてからお試しください。" },
}

export function activityReviewCopy(locale: string) { return locale === "ja" ? ja : zh }
export type ActivityReviewCopy = typeof zh

export function activityReviewErrorMessage(error: string | undefined, locale: string) {
  const copy = activityReviewCopy(locale)
  if (/report_not_editable/i.test(error ?? "")) return copy.reportStateChanged
  if (/review_invalidated/i.test(error ?? "")) return copy.invalidatedHint
  if (/rate_limit/i.test(error ?? "")) return copy.errors.rateLimit
  if (/version|conflict|changed/i.test(error ?? "")) return copy.errors.conflict
  if (/closed|unavailable|eligible|forbidden|window|not_found/i.test(error ?? "")) return copy.errors.unavailable
  if (/score/i.test(error ?? "")) return copy.errors.score
  if (/comment/i.test(error ?? "")) return copy.errors.comment
  if (/report|detail|supplement/i.test(error ?? "")) return copy.errors.report
  return copy.errors.failed
}
