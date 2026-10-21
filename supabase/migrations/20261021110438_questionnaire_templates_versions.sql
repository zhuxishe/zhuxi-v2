-- Existing configuration remains readable for fallback and the mini program.
-- Its legacy write policy must not let an ordinary administrator alter the source
-- used by first initialization and thereby bypass super-admin publication.
DROP POLICY IF EXISTS "管理员可写问卷配置" ON public.personality_quiz_config;
CREATE POLICY questionnaire_legacy_quiz_super_write ON public.personality_quiz_config
  FOR ALL TO authenticated USING ((SELECT private.member_master_is_super_admin()))
  WITH CHECK ((SELECT private.member_master_is_super_admin()));

-- Trusted initialization manifests are definitions only, never live answers/configuration.
CREATE TABLE private.questionnaire_baseline_definitions(kind text PRIMARY KEY,template jsonb NOT NULL);
ALTER TABLE private.questionnaire_baseline_definitions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.questionnaire_baseline_definitions FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO private.questionnaire_baseline_definitions VALUES ('interview', $baseline${"kind":"interview","title":{"zh":"竹溪社 — 面试前信息表","ja":"竹渓社 — 面接前アンケート"},"sections":[{"id":"basic","title":{"zh":"基本信息","ja":"基本情報"}},{"id":"academic","title":{"zh":"学业信息","ja":"学歴情報"}},{"id":"interests","title":{"zh":"兴趣爱好","ja":"趣味・興味"}},{"id":"personality","title":{"zh":"自我评估","ja":"自己評価"}}],"questions":[{"id":"full_name","builtinField":"full_name","sectionId":"basic","type":"text","label":{"zh":"姓名","ja":"氏名"},"required":true,"active":true,"locked":true,"maxLength":100},{"id":"nickname","builtinField":"nickname","sectionId":"basic","type":"text","label":{"zh":"昵称","ja":"ニックネーム"},"required":false,"active":true,"locked":true,"min":2,"maxLength":20},{"id":"gender","builtinField":"gender","sectionId":"basic","type":"single","label":{"zh":"性别","ja":"性別"},"required":true,"active":true,"locked":true,"options":[{"id":"option_1","value":"male","label":{"zh":"男","ja":"男性"}},{"id":"option_2","value":"female","label":{"zh":"女","ja":"女性"}},{"id":"option_3","value":"other","label":{"zh":"其他","ja":"その他"}}]},{"id":"birth_date","builtinField":"birth_date","sectionId":"basic","type":"date","label":{"zh":"生日","ja":"生年月日"},"required":true,"active":true,"locked":true,"description":{"zh":"年龄段将根据生日自动计算。","ja":"生年月日から年齢層を自動計算します。"}},{"id":"nationality","builtinField":"nationality","sectionId":"basic","type":"single","label":{"zh":"国籍/地区","ja":"国籍/地域"},"required":true,"active":true,"locked":true,"options":[{"id":"option_1","value":"中国大陆","label":{"zh":"中国大陆","ja":"中国（大陸）"}},{"id":"option_2","value":"中国台湾","label":{"zh":"中国台湾","ja":"台湾"}},{"id":"option_3","value":"中国香港","label":{"zh":"中国香港","ja":"香港"}},{"id":"option_4","value":"中国澳门","label":{"zh":"中国澳门","ja":"マカオ"}},{"id":"option_5","value":"日本","label":{"zh":"日本","ja":"日本"}},{"id":"option_6","value":"韩国","label":{"zh":"韩国","ja":"韓国"}},{"id":"option_7","value":"其他亚洲","label":{"zh":"其他亚洲","ja":"その他アジア"}},{"id":"option_8","value":"其他","label":{"zh":"其他","ja":"その他"}}]},{"id":"current_city","builtinField":"current_city","sectionId":"basic","type":"single","label":{"zh":"当前所在地","ja":"現在の所在地"},"required":true,"active":true,"locked":true,"options":[{"id":"option_1","value":"东京都","label":{"zh":"东京都","ja":"東京都"}},{"id":"option_2","value":"神奈川县","label":{"zh":"神奈川县","ja":"神奈川県"}},{"id":"option_3","value":"千叶县","label":{"zh":"千叶县","ja":"千葉県"}},{"id":"option_4","value":"埼玉县","label":{"zh":"埼玉县","ja":"埼玉県"}},{"id":"option_5","value":"其他","label":{"zh":"其他","ja":"その他"}}]},{"id":"school_name","builtinField":"school_name","sectionId":"academic","type":"text","label":{"zh":"学校","ja":"学校"},"required":true,"active":true,"locked":true,"maxLength":120},{"id":"department","builtinField":"department","sectionId":"academic","type":"text","label":{"zh":"学部/研究科","ja":"学部/研究科"},"required":false,"active":true,"locked":true,"maxLength":120},{"id":"degree_level","builtinField":"degree_level","sectionId":"academic","type":"single","label":{"zh":"学位阶段","ja":"学位課程"},"required":true,"active":true,"locked":true,"options":[{"id":"option_1","value":"学部生","label":{"zh":"学部生","ja":"学部生"}},{"id":"option_2","value":"修士","label":{"zh":"修士","ja":"修士"}},{"id":"option_3","value":"博士","label":{"zh":"博士","ja":"博士"}},{"id":"option_4","value":"交换留学","label":{"zh":"交换留学","ja":"交換留学"}},{"id":"option_5","value":"语言学校","label":{"zh":"语言学校","ja":"語学学校"}},{"id":"option_6","value":"研究生/预科","label":{"zh":"研究生/预科","ja":"研究生/予科"}},{"id":"option_7","value":"其他","label":{"zh":"其他","ja":"その他"}}]},{"id":"course_language","builtinField":"course_language","sectionId":"academic","type":"single","label":{"zh":"课程语言","ja":"授業言語"},"required":false,"active":true,"locked":true,"options":[{"id":"option_1","value":"日语","label":{"zh":"日语","ja":"日本語"}},{"id":"option_2","value":"英语","label":{"zh":"英语","ja":"英語"}},{"id":"option_3","value":"中文","label":{"zh":"中文","ja":"中国語"}},{"id":"option_4","value":"混合","label":{"zh":"混合","ja":"混合"}}]},{"id":"enrollment_year","builtinField":"enrollment_year","sectionId":"academic","type":"single","label":{"zh":"入学年份","ja":"入学年"},"required":false,"active":true,"locked":true,"options":[{"id":"option_1","value":"2020","label":{"zh":"2020","ja":"2020"}},{"id":"option_2","value":"2021","label":{"zh":"2021","ja":"2021"}},{"id":"option_3","value":"2022","label":{"zh":"2022","ja":"2022"}},{"id":"option_4","value":"2023","label":{"zh":"2023","ja":"2023"}},{"id":"option_5","value":"2024","label":{"zh":"2024","ja":"2024"}},{"id":"option_6","value":"2025","label":{"zh":"2025","ja":"2025"}},{"id":"option_7","value":"2026","label":{"zh":"2026","ja":"2026"}},{"id":"option_8","value":"2027","label":{"zh":"2027","ja":"2027"}},{"id":"option_9","value":"2028","label":{"zh":"2028","ja":"2028"}},{"id":"option_10","value":"2029","label":{"zh":"2029","ja":"2029"}}],"min":1900,"max":2100},{"id":"hobby_tags","builtinField":"hobby_tags","sectionId":"interests","type":"multi","label":{"zh":"个人爱好","ja":"趣味・興味"},"required":true,"active":true,"locked":true,"options":[{"id":"option_1","value":"剧本杀","label":{"zh":"剧本杀","ja":"マーダーミステリー"}},{"id":"option_2","value":"桌游","label":{"zh":"桌游","ja":"ボードゲーム"}},{"id":"option_3","value":"咖啡探店","label":{"zh":"咖啡探店","ja":"カフェ巡り"}},{"id":"option_4","value":"美食","label":{"zh":"美食","ja":"グルメ"}},{"id":"option_5","value":"旅行","label":{"zh":"旅行","ja":"旅行"}},{"id":"option_6","value":"运动","label":{"zh":"运动","ja":"スポーツ"}},{"id":"option_7","value":"音乐","label":{"zh":"音乐","ja":"音楽"}},{"id":"option_8","value":"电影","label":{"zh":"电影","ja":"映画"}},{"id":"option_9","value":"动漫","label":{"zh":"动漫","ja":"アニメ"}},{"id":"option_10","value":"游戏","label":{"zh":"游戏","ja":"ゲーム"}},{"id":"option_11","value":"读书","label":{"zh":"读书","ja":"読書"}},{"id":"option_12","value":"摄影","label":{"zh":"摄影","ja":"写真"}},{"id":"option_13","value":"烹饪","label":{"zh":"烹饪","ja":"料理"}},{"id":"option_14","value":"手工","label":{"zh":"手工","ja":"ハンドメイド"}},{"id":"option_15","value":"绘画","label":{"zh":"绘画","ja":"イラスト"}},{"id":"option_16","value":"舞蹈","label":{"zh":"舞蹈","ja":"ダンス"}},{"id":"option_17","value":"编程","label":{"zh":"编程","ja":"プログラミング"}},{"id":"option_18","value":"语言学习","label":{"zh":"语言学习","ja":"語学学習"}},{"id":"option_19","value":"宠物","label":{"zh":"宠物","ja":"ペット"}},{"id":"option_20","value":"户外活动","label":{"zh":"户外活动","ja":"アウトドア"}},{"id":"option_21","value":"瑜伽/冥想","label":{"zh":"瑜伽/冥想","ja":"ヨガ・瞑想"}},{"id":"option_22","value":"购物","label":{"zh":"购物","ja":"ショッピング"}},{"id":"option_23","value":"志愿活动","label":{"zh":"志愿活动","ja":"ボランティア"}},{"id":"option_24","value":"其他","label":{"zh":"其他","ja":"その他"}}],"maxSelections":8,"description":{"zh":"选择你感兴趣的领域（最多8个）","ja":"興味のある分野を選んでください（最大8個）"}},{"id":"activity_type_tags","builtinField":"activity_type_tags","sectionId":"interests","type":"multi","label":{"zh":"活动类型偏好","ja":"活動タイプの好み"},"required":true,"active":true,"locked":true,"options":[{"id":"option_1","value":"剧本杀","label":{"zh":"剧本杀","ja":"マーダーミステリー"}},{"id":"option_2","value":"桌游","label":{"zh":"桌游","ja":"ボードゲーム"}},{"id":"option_3","value":"聚餐","label":{"zh":"聚餐","ja":"食事会"}},{"id":"option_4","value":"咖啡","label":{"zh":"咖啡","ja":"カフェ"}},{"id":"option_5","value":"城市散步","label":{"zh":"城市散步","ja":"街歩き"}},{"id":"option_6","value":"看展","label":{"zh":"看展","ja":"展示会"}},{"id":"option_7","value":"观影","label":{"zh":"观影","ja":"映画鑑賞"}},{"id":"option_8","value":"K歌","label":{"zh":"K歌","ja":"カラオケ"}},{"id":"option_9","value":"运动","label":{"zh":"运动","ja":"スポーツ"}},{"id":"option_10","value":"旅行","label":{"zh":"旅行","ja":"旅行"}},{"id":"option_11","value":"TRPG","label":{"zh":"TRPG","ja":"TRPG"}},{"id":"option_12","value":"密室逃脱","label":{"zh":"密室逃脱","ja":"脱出ゲーム"}},{"id":"option_13","value":"志愿活动","label":{"zh":"志愿活动","ja":"ボランティア"}},{"id":"option_14","value":"其他","label":{"zh":"其他","ja":"その他"}}],"maxSelections":5,"description":{"zh":"你喜欢参加哪类活动？（最多5个）","ja":"どんな活動に参加したいですか？（最大5個）"}},{"id":"personality_self_tags","builtinField":"personality_self_tags","sectionId":"personality","type":"multi","label":{"zh":"性格自评","ja":"性格の自己評価"},"required":true,"active":true,"locked":true,"options":[{"id":"option_1","value":"外向","label":{"zh":"外向","ja":"外向的"}},{"id":"option_2","value":"内向","label":{"zh":"内向","ja":"内向的"}},{"id":"option_3","value":"社牛","label":{"zh":"社牛","ja":"人見知りしない"}},{"id":"option_4","value":"社恐","label":{"zh":"社恐","ja":"人見知り"}},{"id":"option_5","value":"慢热","label":{"zh":"慢热","ja":"ゆっくり打ち解ける"}},{"id":"option_6","value":"幽默","label":{"zh":"幽默","ja":"ユーモア"}},{"id":"option_7","value":"认真","label":{"zh":"认真","ja":"真面目"}},{"id":"option_8","value":"温和","label":{"zh":"温和","ja":"穏やか"}},{"id":"option_9","value":"直率","label":{"zh":"直率","ja":"率直"}},{"id":"option_10","value":"活泼","label":{"zh":"活泼","ja":"活発"}}],"maxSelections":5,"description":{"zh":"选择最符合你的标签（最多5个）","ja":"自分に最も合うタグを選んでください（最大5個）"}},{"id":"taboo_tags","builtinField":"taboo_tags","sectionId":"personality","type":"multi","label":{"zh":"个人禁忌","ja":"個人的なNG"},"required":false,"active":true,"locked":true,"options":[{"id":"option_1","value":"迟到爽约","label":{"zh":"迟到爽约","ja":"遅刻・ドタキャン"}},{"id":"option_2","value":"临时变卦","label":{"zh":"临时变卦","ja":"急な予定変更"}},{"id":"option_3","value":"强行劝酒","label":{"zh":"强行劝酒","ja":"飲酒の強要"}},{"id":"option_4","value":"室内吸烟","label":{"zh":"室内吸烟","ja":"室内喫煙"}},{"id":"option_5","value":"过度肢体接触","label":{"zh":"过度肢体接触","ja":"過度なボディタッチ"}},{"id":"option_6","value":"过度打探隐私","label":{"zh":"过度打探隐私","ja":"過度なプライバシー詮索"}},{"id":"option_7","value":"偷拍","label":{"zh":"偷拍","ja":"盗撮"}},{"id":"option_8","value":"恋爱导向过强","label":{"zh":"恋爱导向过强","ja":"恋愛目的が強すぎる"}},{"id":"option_9","value":"借钱/推销","label":{"zh":"借钱/推销","ja":"金銭貸借・セールス"}},{"id":"option_10","value":"酒后失控","label":{"zh":"酒后失控","ja":"泥酔"}},{"id":"option_11","value":"脏话攻击","label":{"zh":"脏话攻击","ja":"暴言"}},{"id":"option_12","value":"情绪输出过强","label":{"zh":"情绪输出过强","ja":"感情的になりすぎる"}},{"id":"option_13","value":"私人空间局","label":{"zh":"私人空间局","ja":"個室・プライベート空間"}},{"id":"option_14","value":"单独异性局","label":{"zh":"单独异性局","ja":"異性との二人きり"}},{"id":"option_15","value":"临时加人","label":{"zh":"临时加人","ja":"急な人数変更"}},{"id":"option_16","value":"过远通勤","label":{"zh":"过远通勤","ja":"遠すぎる移動"}},{"id":"option_17","value":"不接受恐怖内容","label":{"zh":"不接受恐怖内容","ja":"ホラー系NG"}},{"id":"option_18","value":"不接受高压竞争","label":{"zh":"不接受高压竞争","ja":"ガチ競争NG"}},{"id":"option_19","value":"无明显禁忌","label":{"zh":"无明显禁忌","ja":"特になし"}},{"id":"option_20","value":"其他","label":{"zh":"其他","ja":"その他"}}],"description":{"zh":"有什么不能接受的？（可选）","ja":"受け入れられないことはありますか？（任意）"}}]}$baseline$::jsonb);
INSERT INTO private.questionnaire_baseline_definitions VALUES ('supplementary', $baseline${"kind":"supplementary","title":{"zh":"补充资料","ja":"追加情報"},"sections":[{"id":"location","title":{"zh":"位置","ja":"場所"}},{"id":"language","title":{"zh":"语言","ja":"言語"}},{"id":"activities","title":{"zh":"活动","ja":"活動"}},{"id":"social","title":{"zh":"社交","ja":"交流"}}],"questions":[{"id":"activity_area","builtinField":"activity_area","sectionId":"location","type":"single","label":{"zh":"常活动区域","ja":"よく活動するエリア"},"required":false,"active":true,"locked":true,"options":[{"id":"option_1","value":"新宿/渋谷","label":{"zh":"新宿/渋谷","ja":"新宿/渋谷"}},{"id":"option_2","value":"池袋","label":{"zh":"池袋","ja":"池袋"}},{"id":"option_3","value":"上野/秋葉原","label":{"zh":"上野/秋葉原","ja":"上野/秋葉原"}},{"id":"option_4","value":"品川/目黒","label":{"zh":"品川/目黒","ja":"品川/目黒"}},{"id":"option_5","value":"六本木/赤坂","label":{"zh":"六本木/赤坂","ja":"六本木/赤坂"}},{"id":"option_6","value":"横浜","label":{"zh":"横浜","ja":"横浜"}},{"id":"option_7","value":"千葉","label":{"zh":"千葉","ja":"千葉"}},{"id":"option_8","value":"さいたま","label":{"zh":"さいたま","ja":"さいたま"}},{"id":"option_9","value":"其他","label":{"zh":"其他","ja":"その他"}}]},{"id":"nearest_station","builtinField":"nearest_station","sectionId":"location","type":"text","label":{"zh":"最近车站","ja":"最寄り駅"},"required":false,"active":true,"locked":true,"maxLength":100},{"id":"graduation_year","builtinField":"graduation_year","sectionId":"location","type":"single","label":{"zh":"预计毕业年份","ja":"卒業予定年"},"required":false,"active":true,"locked":true,"options":[{"id":"option_1","value":"2026","label":{"zh":"2026","ja":"2026"}},{"id":"option_2","value":"2027","label":{"zh":"2027","ja":"2027"}},{"id":"option_3","value":"2028","label":{"zh":"2028","ja":"2028"}},{"id":"option_4","value":"2029","label":{"zh":"2029","ja":"2029"}},{"id":"option_5","value":"2030","label":{"zh":"2030","ja":"2030"}},{"id":"option_6","value":"2031","label":{"zh":"2031","ja":"2031"}},{"id":"option_7","value":"2032","label":{"zh":"2032","ja":"2032"}}],"min":1900,"max":2100},{"id":"communication_language_pref","builtinField":"communication_language_pref","sectionId":"language","type":"multi","label":{"zh":"交流语言偏好","ja":"コミュニケーション言語"},"required":false,"active":true,"locked":true,"options":[{"id":"option_1","value":"中文","label":{"zh":"中文","ja":"中国語"}},{"id":"option_2","value":"日语","label":{"zh":"日语","ja":"日本語"}},{"id":"option_3","value":"英语","label":{"zh":"英语","ja":"英語"}}],"description":{"zh":"你希望用什么语言交流？","ja":"どの言語でコミュニケーションしたいですか？"}},{"id":"japanese_level","builtinField":"japanese_level","sectionId":"language","type":"single","label":{"zh":"日语水平","ja":"日本語レベル"},"required":false,"active":true,"locked":true,"options":[{"id":"option_1","value":"N1","label":{"zh":"N1","ja":"N1"}},{"id":"option_2","value":"N2","label":{"zh":"N2","ja":"N2"}},{"id":"option_3","value":"N3","label":{"zh":"N3","ja":"N3"}},{"id":"option_4","value":"N4","label":{"zh":"N4","ja":"N4"}},{"id":"option_5","value":"N5","label":{"zh":"N5","ja":"N5"}},{"id":"option_6","value":"无证书但能日常交流","label":{"zh":"无证书但能日常交流","ja":"資格なし（日常会話可能）"}},{"id":"option_7","value":"不会日语","label":{"zh":"不会日语","ja":"日本語不可"}}]},{"id":"game_type_pref","builtinField":"game_type_pref","sectionId":"activities","type":"single","label":{"zh":"玩本类型","ja":"プレイタイプ"},"required":false,"active":true,"locked":true,"options":[{"id":"option_1","value":"双人本优先","label":{"zh":"双人本优先","ja":"2人シナリオ優先"}},{"id":"option_2","value":"多人本优先","label":{"zh":"多人本优先","ja":"多人シナリオ優先"}},{"id":"option_3","value":"都可以","label":{"zh":"都可以","ja":"どちらでも"}},{"id":"option_4","value":"看活动而定","label":{"zh":"看活动而定","ja":"イベントによる"}}]},{"id":"scenario_mode_pref","builtinField":"scenario_mode_pref","sectionId":"activities","type":"multi","label":{"zh":"喜欢的剧本类型","ja":"好きなシナリオタイプ"},"required":false,"active":true,"locked":true,"options":[{"id":"option_1","value":"推理本","label":{"zh":"推理本","ja":"推理系"}},{"id":"option_2","value":"情感本","label":{"zh":"情感本","ja":"感情系"}},{"id":"option_3","value":"恐怖本","label":{"zh":"恐怖本","ja":"ホラー系"}},{"id":"option_4","value":"欢乐本","label":{"zh":"欢乐本","ja":"コメディ系"}},{"id":"option_5","value":"机制本","label":{"zh":"机制本","ja":"メカニズム系"}},{"id":"option_6","value":"阵营本","label":{"zh":"阵营本","ja":"陣営系"}},{"id":"option_7","value":"沉浸本","label":{"zh":"沉浸本","ja":"没入系"}}],"description":{"zh":"可多选","ja":"複数選択可"}},{"id":"scenario_theme_tags","builtinField":"scenario_theme_tags","sectionId":"activities","type":"multi","label":{"zh":"剧本主题偏好","ja":"シナリオテーマの好み"},"required":false,"active":true,"locked":true,"options":[{"id":"option_1","value":"情感","label":{"zh":"情感","ja":"感情"}},{"id":"option_2","value":"推理","label":{"zh":"推理","ja":"推理"}},{"id":"option_3","value":"机制","label":{"zh":"机制","ja":"メカニズム"}},{"id":"option_4","value":"恐怖","label":{"zh":"恐怖","ja":"ホラー"}},{"id":"option_5","value":"欢乐","label":{"zh":"欢乐","ja":"コメディ"}},{"id":"option_6","value":"沉浸","label":{"zh":"沉浸","ja":"没入"}},{"id":"option_7","value":"硬核","label":{"zh":"硬核","ja":"ハードコア"}},{"id":"option_8","value":"新手友好","label":{"zh":"新手友好","ja":"初心者向け"}}],"description":{"zh":"喜欢什么风格的剧本？可多选","ja":"どんなジャンルが好きですか？複数選択可"}},{"id":"ideal_group_size","builtinField":"ideal_group_size","sectionId":"activities","type":"single","label":{"zh":"理想活动人数","ja":"理想的な参加人数"},"required":false,"active":true,"locked":true,"options":[{"id":"option_1","value":"2人","label":{"zh":"2人","ja":"2人"}},{"id":"option_2","value":"3-4人","label":{"zh":"3-4人","ja":"3-4人"}},{"id":"option_3","value":"4-10人","label":{"zh":"4-10人","ja":"4-10人"}},{"id":"option_4","value":"10人以上","label":{"zh":"10人以上","ja":"10人以上"}},{"id":"option_5","value":"都可以","label":{"zh":"都可以","ja":"どちらでも"}}]},{"id":"script_preference","builtinField":"script_preference","sectionId":"activities","type":"multi","label":{"zh":"剧本偏好","ja":"シナリオの好み"},"required":false,"active":true,"locked":true,"options":[{"id":"option_1","value":"新本","label":{"zh":"新本","ja":"新作"}},{"id":"option_2","value":"经典本","label":{"zh":"经典本","ja":"名作"}},{"id":"option_3","value":"城限本","label":{"zh":"城限本","ja":"都市限定"}},{"id":"option_4","value":"独家本","label":{"zh":"独家本","ja":"独占作"}},{"id":"option_5","value":"都可以","label":{"zh":"都可以","ja":"どちらでも"}}]},{"id":"non_script_preference","builtinField":"non_script_preference","sectionId":"activities","type":"multi","label":{"zh":"非剧本活动偏好","ja":"シナリオ以外の活動の好み"},"required":false,"active":true,"locked":true,"options":[{"id":"option_1","value":"桌游","label":{"zh":"桌游","ja":"ボードゲーム"}},{"id":"option_2","value":"聚餐","label":{"zh":"聚餐","ja":"食事会"}},{"id":"option_3","value":"KTV","label":{"zh":"KTV","ja":"カラオケ"}},{"id":"option_4","value":"运动","label":{"zh":"运动","ja":"スポーツ"}},{"id":"option_5","value":"旅行","label":{"zh":"旅行","ja":"旅行"}},{"id":"option_6","value":"展览","label":{"zh":"展览","ja":"展示会"}},{"id":"option_7","value":"读书会","label":{"zh":"读书会","ja":"読書会"}},{"id":"option_8","value":"其他","label":{"zh":"其他","ja":"その他"}}]},{"id":"activity_frequency","builtinField":"activity_frequency","sectionId":"activities","type":"single","label":{"zh":"活动频率","ja":"活動頻度"},"required":false,"active":true,"locked":true,"options":[{"id":"option_1","value":"每周1次以上","label":{"zh":"每周1次以上","ja":"週1回以上"}},{"id":"option_2","value":"每周1次","label":{"zh":"每周1次","ja":"週1回"}},{"id":"option_3","value":"每两周1次","label":{"zh":"每两周1次","ja":"隔週1回"}},{"id":"option_4","value":"每月1次","label":{"zh":"每月1次","ja":"月1回"}},{"id":"option_5","value":"不固定","label":{"zh":"不固定","ja":"不定期"}}]},{"id":"preferred_time_slots","builtinField":"preferred_time_slots","sectionId":"activities","type":"multi","label":{"zh":"偏好时段","ja":"希望する時間帯"},"required":false,"active":true,"locked":true,"options":[{"id":"option_1","value":"工作日白天","label":{"zh":"工作日白天","ja":"平日昼"}},{"id":"option_2","value":"工作日晚间","label":{"zh":"工作日晚间","ja":"平日夜"}},{"id":"option_3","value":"周五晚","label":{"zh":"周五晚","ja":"金曜夜"}},{"id":"option_4","value":"周六白天","label":{"zh":"周六白天","ja":"土曜昼"}},{"id":"option_5","value":"周六晚","label":{"zh":"周六晚","ja":"土曜夜"}},{"id":"option_6","value":"周日白天","label":{"zh":"周日白天","ja":"日曜昼"}},{"id":"option_7","value":"周日晚","label":{"zh":"周日晚","ja":"日曜夜"}},{"id":"option_8","value":"节假日","label":{"zh":"节假日","ja":"祝日"}},{"id":"option_9","value":"临时约也可","label":{"zh":"临时约也可","ja":"急な誘いもOK"}}],"description":{"zh":"可多选","ja":"複数選択可"}},{"id":"budget_range","builtinField":"budget_range","sectionId":"activities","type":"single","label":{"zh":"每次活动预算","ja":"1回あたりの予算"},"required":false,"active":true,"locked":true,"options":[{"id":"option_1","value":"~2000円","label":{"zh":"~2000円","ja":"~2000円"}},{"id":"option_2","value":"2000~4000円","label":{"zh":"2000~4000円","ja":"2000~4000円"}},{"id":"option_3","value":"4000~6000円","label":{"zh":"4000~6000円","ja":"4000~6000円"}},{"id":"option_4","value":"6000円以上","label":{"zh":"6000円以上","ja":"6000円以上"}},{"id":"option_5","value":"无所谓","label":{"zh":"无所谓","ja":"気にしない"}}]},{"id":"travel_radius","builtinField":"travel_radius","sectionId":"activities","type":"single","label":{"zh":"可接受出行时间","ja":"移動可能な時間"},"required":false,"active":true,"locked":true,"options":[{"id":"option_1","value":"30分钟以内","label":{"zh":"30分钟以内","ja":"30分以内"}},{"id":"option_2","value":"1小时以内","label":{"zh":"1小时以内","ja":"1時間以内"}},{"id":"option_3","value":"1~2小时","label":{"zh":"1~2小时","ja":"1〜2時間"}},{"id":"option_4","value":"都可以","label":{"zh":"都可以","ja":"どちらでも"}}]},{"id":"social_goal_primary","builtinField":"social_goal_primary","sectionId":"social","type":"single","label":{"zh":"主要社交目标","ja":"主な交流目的"},"required":false,"active":true,"locked":true,"options":[{"id":"option_1","value":"认识新朋友","label":{"zh":"认识新朋友","ja":"新しい友達を作る"}},{"id":"option_2","value":"找固定玩伴","label":{"zh":"找固定玩伴","ja":"固定の遊び仲間"}},{"id":"option_3","value":"练习日语","label":{"zh":"练习日语","ja":"日本語の練習"}},{"id":"option_4","value":"体验文化","label":{"zh":"体验文化","ja":"文化体験"}},{"id":"option_5","value":"打发时间","label":{"zh":"打发时间","ja":"暇つぶし"}},{"id":"option_6","value":"拓展社交圈","label":{"zh":"拓展社交圈","ja":"人脈を広げる"}},{"id":"option_7","value":"找双人搭子","label":{"zh":"找双人搭子","ja":"ペアの相手探し"}},{"id":"option_8","value":"找剧本杀搭子","label":{"zh":"找剧本杀搭子","ja":"謎解き仲間探し"}},{"id":"option_9","value":"找旅行搭子","label":{"zh":"找旅行搭子","ja":"旅行仲間探し"}}]},{"id":"social_goal_secondary","builtinField":"social_goal_secondary","sectionId":"social","type":"single","label":{"zh":"次要社交目标","ja":"副次的な交流目的"},"required":false,"active":true,"locked":true,"options":[{"id":"option_1","value":"认识新朋友","label":{"zh":"认识新朋友","ja":"新しい友達を作る"}},{"id":"option_2","value":"找固定玩伴","label":{"zh":"找固定玩伴","ja":"固定の遊び仲間"}},{"id":"option_3","value":"练习日语","label":{"zh":"练习日语","ja":"日本語の練習"}},{"id":"option_4","value":"体验文化","label":{"zh":"体验文化","ja":"文化体験"}},{"id":"option_5","value":"打发时间","label":{"zh":"打发时间","ja":"暇つぶし"}},{"id":"option_6","value":"拓展社交圈","label":{"zh":"拓展社交圈","ja":"人脈を広げる"}},{"id":"option_7","value":"找双人搭子","label":{"zh":"找双人搭子","ja":"ペアの相手探し"}},{"id":"option_8","value":"找剧本杀搭子","label":{"zh":"找剧本杀搭子","ja":"謎解き仲間探し"}},{"id":"option_9","value":"找旅行搭子","label":{"zh":"找旅行搭子","ja":"旅行仲間探し"}}]},{"id":"accept_beginners","builtinField":"accept_beginners","sectionId":"social","type":"single","label":{"zh":"是否接受新手玩家？","ja":"初心者の参加を受け入れますか？"},"required":false,"active":true,"locked":true,"options":[{"id":"option_1","value":"true","label":{"zh":"是","ja":"はい"}},{"id":"option_2","value":"false","label":{"zh":"否","ja":"いいえ"}}]},{"id":"accept_cross_school","builtinField":"accept_cross_school","sectionId":"social","type":"single","label":{"zh":"是否接受跨校/跨区参加？","ja":"他校/他エリアからの参加を受け入れますか？"},"required":false,"active":true,"locked":true,"options":[{"id":"option_1","value":"true","label":{"zh":"是","ja":"はい"}},{"id":"option_2","value":"false","label":{"zh":"否","ja":"いいえ"}}]}]}$baseline$::jsonb);
INSERT INTO private.questionnaire_baseline_definitions VALUES ('personality', $baseline${"kind":"personality","title":{"zh":"性格自评","ja":"性格の自己評価"},"sections":[{"id":"personality","title":{"zh":"性格自评","ja":"性格の自己評価"}}],"questions":[{"id":"extroversion","builtinField":"extroversion","sectionId":"personality","type":"rating","label":{"zh":"外向度","ja":"外向性"},"required":true,"active":true,"locked":true,"description":{"zh":"你在社交场合的能量来源","ja":"社交の場でのエネルギー源"},"min":1,"max":5},{"id":"initiative","builtinField":"initiative","sectionId":"personality","type":"rating","label":{"zh":"主动度","ja":"積極性"},"required":true,"active":true,"locked":true,"description":{"zh":"你倾向于主动发起还是等待邀请","ja":"自分から誘うタイプ？誘われ待ちタイプ？"},"min":1,"max":5},{"id":"expression_style_tags","builtinField":"expression_style_tags","sectionId":"personality","type":"multi","label":{"zh":"表达风格","ja":"表現スタイル"},"required":true,"active":true,"locked":true,"description":{"zh":"你的交流方式（可多选）","ja":"あなたのコミュニケーションスタイル（複数選択可）"},"options":[{"id":"option_1","value":"温和","label":{"zh":"温和","ja":"穏やか"}},{"id":"option_2","value":"直率","label":{"zh":"直率","ja":"ストレート"}},{"id":"option_3","value":"幽默","label":{"zh":"幽默","ja":"ユーモア"}},{"id":"option_4","value":"理性","label":{"zh":"理性","ja":"理性的"}},{"id":"option_5","value":"倾听型","label":{"zh":"倾听型","ja":"聞き上手"}}]},{"id":"group_role_tags","builtinField":"group_role_tags","sectionId":"personality","type":"multi","label":{"zh":"群体角色","ja":"グループでの役割"},"required":true,"active":true,"locked":true,"description":{"zh":"你在团体中通常扮演的角色（可多选）","ja":"グループで普段担う役割（複数選択可）"},"options":[{"id":"option_1","value":"组织者","label":{"zh":"组织者","ja":"まとめ役"}},{"id":"option_2","value":"破冰者","label":{"zh":"破冰者","ja":"ムードメーカー"}},{"id":"option_3","value":"倾听者","label":{"zh":"倾听者","ja":"聞き役"}},{"id":"option_4","value":"气氛组","label":{"zh":"气氛组","ja":"盛り上げ役"}}]},{"id":"warmup_speed","builtinField":"warmup_speed","sectionId":"personality","type":"single","label":{"zh":"熟络节奏","ja":"打ち解けるペース"},"required":true,"active":true,"locked":true,"description":{"zh":"你和新朋友熟悉的速度","ja":"新しい友達と打ち解ける速さ"},"options":[{"id":"option_1","value":"快速熟络","label":{"zh":"快速熟络","ja":"すぐ仲良くなる"}},{"id":"option_2","value":"先浅后深","label":{"zh":"先浅后深","ja":"徐々に深まる"}},{"id":"option_3","value":"慢热稳定","label":{"zh":"慢热稳定","ja":"ゆっくり安定型"}}]},{"id":"planning_style","builtinField":"planning_style","sectionId":"personality","type":"single","label":{"zh":"计划性","ja":"計画性"},"required":true,"active":true,"locked":true,"description":{"zh":"你对活动安排的态度","ja":"イベント計画に対する姿勢"},"options":[{"id":"option_1","value":"计划型","label":{"zh":"计划型","ja":"計画派"}},{"id":"option_2","value":"半计划","label":{"zh":"半计划","ja":"半計画派"}},{"id":"option_3","value":"随性","label":{"zh":"随性","ja":"気まま派"}}]},{"id":"coop_compete_tendency","builtinField":"coop_compete_tendency","sectionId":"personality","type":"single","label":{"zh":"合作竞技倾向","ja":"協力・競争の傾向"},"required":true,"active":true,"locked":true,"description":{"zh":"你在游戏中的偏好","ja":"ゲームでの好み"},"options":[{"id":"option_1","value":"偏合作","label":{"zh":"偏合作","ja":"協力寄り"}},{"id":"option_2","value":"均衡","label":{"zh":"均衡","ja":"バランス型"}},{"id":"option_3","value":"偏竞技","label":{"zh":"偏竞技","ja":"競争寄り"}}]},{"id":"emotional_stability","builtinField":"emotional_stability","sectionId":"personality","type":"rating","label":{"zh":"情绪稳定度","ja":"感情の安定度"},"required":true,"active":true,"locked":true,"description":{"zh":"你在压力或意外情况下的情绪反应","ja":"プレッシャーや予想外の状況での反応"},"min":1,"max":5},{"id":"boundary_strength","builtinField":"boundary_strength","sectionId":"personality","type":"single","label":{"zh":"边界强度","ja":"パーソナルスペース"},"required":true,"active":true,"locked":true,"description":{"zh":"你对个人空间和隐私的要求","ja":"個人のスペースやプライバシーへのこだわり"},"options":[{"id":"option_1","value":"柔软","label":{"zh":"柔软","ja":"ゆるめ"}},{"id":"option_2","value":"适中","label":{"zh":"适中","ja":"ふつう"}},{"id":"option_3","value":"偏强","label":{"zh":"偏强","ja":"しっかり"}}]},{"id":"reply_speed","builtinField":"reply_speed","sectionId":"personality","type":"single","label":{"zh":"回复节奏","ja":"返信のペース"},"required":true,"active":true,"locked":true,"description":{"zh":"你通常的消息回复速度","ja":"普段のメッセージ返信速度"},"options":[{"id":"option_1","value":"秒回","label":{"zh":"秒回","ja":"即レス"}},{"id":"option_2","value":"当天","label":{"zh":"当天","ja":"当日中"}},{"id":"option_3","value":"慢回可","label":{"zh":"慢回可","ja":"ゆっくりOK"}}]}]}$baseline$::jsonb);
INSERT INTO private.questionnaire_baseline_definitions VALUES ('quiz', $baseline${"kind":"quiz","title":{"zh":"ZSP-15 社交人格测试","ja":"ZSP-15 ソーシャルパーソナリティテスト"},"sections":[{"id":"quiz","title":{"zh":"性格测试","ja":"性格テスト"}}],"quizConfig":{"questions":[{"id":1,"dimension":"E","text":"竹溪社的周末活动，你到了现场发现大部分人你都不认识。你会——","options":[{"text":"主动找看起来也是一个人的同学搭话","score":6},{"text":"先观察一会儿，如果有人看过来就微笑回应","score":4.5},{"text":"找到组织者让他们帮忙介绍","score":3},{"text":"安静等活动正式开始，不急着认识人","score":1.5}]},{"id":2,"dimension":"E","text":"周五晚上，室友说隔壁研究室的同学约了一群人去居酒屋。你——","options":[{"text":"正好想出去，立刻答应","score":6},{"text":"问一下大概几个人、去哪里，觉得还行就去","score":4.5},{"text":"今天有点累，但室友很想去的话就陪一下","score":3},{"text":"谢了，今晚就想一个人待着充充电","score":1.5}]},{"id":3,"dimension":"E","text":"竹溪社线上发表会，主持人问「有没有人想分享最近的经历？」你——","options":[{"text":"第一个开麦，正好有个有趣的故事","score":6},{"text":"等别人先讲，如果氛围不错也会分享","score":4.5},{"text":"在聊天框打字分享，比开麦自在一些","score":3},{"text":"安静听别人讲就好，这种场合不太想说","score":1.5}]},{"id":4,"dimension":"A","text":"竹溪社多人活动中，小组需要决定策划方案，大家意见不一样。你倾向于——","options":[{"text":"汇总大家的想法，尝试找到一个大家都接受的方案","score":6},{"text":"说出自己的想法，但如果多数人不同意就配合大家","score":4.5},{"text":"提议直接投票，按规则来最公平","score":3},{"text":"坚持自己觉得最好的方案，用逻辑说服大家","score":1.5}]},{"id":5,"dimension":"A","text":"活动结束后一起吃饭，有个比较安静的同学一直没怎么说话。你——","options":[{"text":"找个话题主动跟TA聊，让TA参与进来","score":6},{"text":"偶尔眼神交流一下，如果TA想加入自然会开口","score":4.5},{"text":"注意到了但不特别做什么，每个人有自己的节奏","score":3},{"text":"没怎么注意，自己聊得挺开心的","score":1.5}]},{"id":6,"dimension":"A","text":"朋友向你借一笔不算小的钱，说下个月还。你——","options":[{"text":"二话不说就借了，朋友之间不用计较","score":6},{"text":"借了，但委婉提醒一下还款时间","score":4.5},{"text":"根据跟这个人的关系和信任程度决定借不借","score":3},{"text":"找个理由委婉拒绝，借钱的事容易伤感情","score":1.5}]},{"id":7,"dimension":"O","text":"竹溪社推出了一个你从没尝试过的活动类型（比如即兴戏剧/户外写生/辩论赛）。你——","options":[{"text":"第一时间报名，没试过的东西才有意思","score":6},{"text":"先了解一下规则和流程，觉得有趣就报","score":4.5},{"text":"看看有没有朋友一起去，一个人不太想尝试新东西","score":3},{"text":"等下次有熟悉类型的活动再参加，不想踩雷","score":1.5}]},{"id":8,"dimension":"O","text":"来日本后，有个日本同学邀请你参加他们研究室的忘年会。你——","options":[{"text":"太好了，正想体验地道的日本文化","score":6},{"text":"有点好奇，虽然日语不太好但愿意试试","score":4.5},{"text":"犹豫一下，问问有没有其他留学生也去","score":3},{"text":"感觉融入不了，还是跟留学生朋友聚更自在","score":1.5}]},{"id":9,"dimension":"O","text":"选餐厅吃饭，菜单上有一道你完全没见过的料理。你——","options":[{"text":"直接点了，就喜欢尝新的东西","score":6},{"text":"问一下店员这是什么，觉得能接受就试试","score":4.5},{"text":"先看看别的桌有没有人点，看看实物再说","score":3},{"text":"还是点自己吃过的，不想冒险踩雷","score":1.5}]},{"id":10,"dimension":"C","text":"竹溪社活动通知说「请提前10分钟到达集合点」。你通常——","options":[{"text":"提前15-20分钟到，先熟悉一下环境","score":6},{"text":"提前10分钟准时到达","score":4.5},{"text":"大约准时到，偶尔迟到一两分钟","score":3},{"text":"经常踩着点到或晚几分钟，差不多就行","score":1.5}]},{"id":11,"dimension":"C","text":"下周有一个重要的小组作业要交。今天是周日，你——","options":[{"text":"已经做完了，今天检查一遍就好","score":6},{"text":"做了大半，今天集中精力收尾","score":4.5},{"text":"还没开始，但心里有个大致计划","score":3},{"text":"还没想呢，还有一周慢慢来","score":1.5}]},{"id":12,"dimension":"C","text":"朋友约你明天出去玩。你——","options":[{"text":"今晚就查好路线、餐厅和时间安排","score":6},{"text":"大概想一下去哪个方向，细节到时候再说","score":4.5},{"text":"到时候再看吧，随机应变更有趣","score":3},{"text":"完全不想，走到哪算哪","score":1.5}]},{"id":13,"dimension":"N","text":"竹溪社给你匹配了一个完全不认识的搭档去玩双人本。出发前你——","options":[{"text":"反复想「万一不合拍怎么办」「会不会冷场」","score":6},{"text":"有点忐忑，但告诉自己试试看","score":4.5},{"text":"没什么特别感觉，到时候自然就好","score":3},{"text":"很期待，遇到新的人是一件有趣的事","score":1.5}]},{"id":14,"dimension":"N","text":"你在群里发了一条消息，过了半小时没人回复。你——","options":[{"text":"开始想是不是自己说了不合适的话","score":6},{"text":"稍微有点在意，但提醒自己大家可能在忙","score":4.5},{"text":"没怎么注意，想看到了自然会回","score":3},{"text":"完全不在意这种事","score":1.5}]},{"id":15,"dimension":"N","text":"明天有一个重要的面试/发表。今天晚上你——","options":[{"text":"翻来覆去睡不着，脑子里反复预演各种意外","score":6},{"text":"有点紧张，但还是能睡着","score":4.5},{"text":"简单准备一下就睡了","score":3},{"text":"一点不紧张，该干嘛干嘛","score":1.5}]}],"dimensions":{"E":{"name":"社交能量","matchWeight":0.3,"descriptions":{"low":"你的电量靠独处回血，人多的地方是你的耗电模式。","mid":"社交和独处都行，看当天心情和在场的人。","high":"人越多你越来劲，安静反而让你浑身不自在。"}},"A":{"name":"社交温度","matchWeight":0.3,"descriptions":{"low":"你重效率和逻辑，不太会因为「不好意思」而改变决定。","mid":"该暖的时候暖，该硬的时候也不含糊，温度随场景调节。","high":"你天然在意别人的感受，聚会里那个默默照顾所有人的往往是你。"}},"O":{"name":"探索倾向","matchWeight":0.15,"descriptions":{"low":"你喜欢确定性，熟悉的东西让你安心，冒险请找别人。","mid":"新事物要先看看评价，确认安全了再下手。","high":"「没试过」三个字对你来说不是警告，是邀请函。"}},"C":{"name":"行动节奏","matchWeight":0.1,"descriptions":{"low":"计划是什么？能吃吗？你和deadline有一种微妙的默契——总在最后一刻相遇。","mid":"大方向有，细节随缘，不至于翻车但也不追求满分。","high":"出门前查路线、列清单、算时间，你的日程表比瑞士钟表还准。"}},"N":{"name":"情绪锚点","matchWeight":0.15,"descriptions":{"low":"你的内心像装了减震器，外面风浪再大，里面波澜不惊。","mid":"大部分时候稳得住，偶尔也会被突发状况晃一下。","high":"你的情绪雷达灵敏度拉满，别人一个眼神你就能脑补出一部电影。"}}},"typeLabels":{"formal":{"prefix":{"E":"热情","A":"温暖","O":"好奇","C":"稳健","ES":"从容"},"suffix":{"E":"行动派","A":"守护者","O":"探索者","C":"规划者","ES":"安定者"}},"fun":{"prefix":{"E":"话唠","A":"暖宝宝","O":"野生","C":"靠谱","ES":"佛系"},"suffix":{"E":"冲锋鸡","A":"奶妈","O":"冒险王","C":"表格侠","ES":"定海神针"}}},"typeDescriptions":{"热情守护者":{"description":"恭喜你获得了聚会的灵魂+保姆双重认证！你天生自带麦克风光环，能让陌生人三分钟内变成老朋友，还会悄悄记住每个人的过敏原和忌口。你的存在让社群像一个24小时营业的暖气团。","imageUrl":"/images/personality/enthusiastic-guardian.webp"},"热情探索者":{"description":"你是那种在聚餐时能把「我最近在研究量子力学」说得比菜单更令人期待的人。社交对你来说是田野调查，每一个新朋友都是一扇通往平行宇宙的门。","imageUrl":"/images/personality/enthusiastic-explorer.webp"},"热情规划者":{"description":"派对有你在，时间表比地铁班次还精准，但氛围却比自由市场还热烈——这是只有你能做到的魔法。活动还没结束，下一场的群已经建好了。","imageUrl":"/images/personality/enthusiastic-planner.webp"},"热情安定者":{"description":"你是社群的天然稳压器——人多的地方你能带动气氛，场面失控时你又能轻描淡写地接住一切。别人社交完需要充电，你充的就是社交本身。","imageUrl":"/images/personality/enthusiastic-stabilizer.webp"},"温暖行动派":{"description":"你是那种「说走就走」后面还会加一句「我来定酒店」的人。你用行动诠释关心，用速度证明温度——在你这里，爱是动词，而且是现在进行时。","imageUrl":"/images/personality/warm-activist.webp"},"温暖探索者":{"description":"你问问题的方式像温水，让人不知不觉就说了很多真心话。你收集故事，但不消费故事；你了解别人，但不定义别人——这是很稀有的能力。","imageUrl":"/images/personality/warm-explorer.webp"},"温暖规划者":{"description":"你是那种会在朋友生日前三周就悄悄备好惊喜方案的人，还能确保对乳糖不耐受的那位也有蛋糕吃。你把细心变成了系统工程，把在乎变成了可执行的清单。","imageUrl":"/images/personality/warm-planner.webp"},"温暖安定者":{"description":"你是社群里那把永远坐着的椅子——不会主动冲到最前面，但每个需要坐下来的人都会本能地找到你。有你在的群，撕不起来，因为大家都不好意思。","imageUrl":"/images/personality/warm-stabilizer.webp"},"好奇行动派":{"description":"你的人生信条大概是：与其想明白，不如先试试。你把「有趣」当作第一行动准则，在别人还在做可行性分析的时候，你已经拿到了结论并开始想下一个问题了。","imageUrl":"/images/personality/curious-activist.webp"},"好奇守护者":{"description":"你的好奇心不只指向知识，更指向人——你真心想知道每一个人背后的故事，而且会在他们说完之后，替他们好好保管这段故事。","imageUrl":"/images/personality/curious-guardian.webp"},"好奇规划者":{"description":"你是那种会做出十页调研报告然后说「我们下周去试试」的人。在你眼里，任何有趣的事都值得认真对待，任何认真的事也都可以变得有趣。","imageUrl":"/images/personality/curious-planner.webp"},"好奇安定者":{"description":"你很少着急，但你几乎什么都感兴趣——这让你成为最好的聊天对象。你的平静里藏着一个安静运转的宇宙。","imageUrl":"/images/personality/curious-stabilizer.webp"},"稳健行动派":{"description":"你不是最先举手的那个，但你是真的把事情做完的那个。有你参与的活动，细节不会漏，突发不会乱——你是那种让团队集体睡个好觉的人。","imageUrl":"/images/personality/steady-activist.webp"},"稳健守护者":{"description":"你不会说很多话，但你说的每一句都会被记住。你用一致性建立信任，用耐心建立关系。朋友们心里都清楚：在所有人里，你是那个最不会让人失望的。","imageUrl":"/images/personality/steady-guardian.webp"},"稳健探索者":{"description":"你探索新事物的方式像地质勘测——不冲动，但很深入。你的知识体系不是百科词条式的，而是有脉络的，是你真正走过、想过、验证过的版图。","imageUrl":"/images/personality/steady-explorer.webp"},"稳健安定者":{"description":"你是社群里那座不显眼但谁都靠得住的山。不抢风头，不制造张力，但在关键时刻总是稳稳地在那里。你不需要被夸，但每个人心里都知道你有多重要。","imageUrl":"/images/personality/steady-stabilizer.webp"},"从容行动派":{"description":"你是「说走就走」但从不慌乱的那种人——行李永远只有一个包，但你始终是最先到达又最早适应的那个。你的淡定不是冷漠，是一种对自己的深度信任。","imageUrl":"/images/personality/serene-activist.webp"},"从容守护者":{"description":"你不会大声说「我关心你」，但你会在对方还没意识到自己需要帮助的时候，就已经轻轻递过去了。你的关怀不黏腻，你的陪伴不消耗人。","imageUrl":"/images/personality/serene-guardian.webp"},"从容探索者":{"description":"你对新事物充满兴趣，但不执着于结论——「有意思」对你来说本身就是目的地。你探索世界的姿态很松弛，像是在散步，不像在赶路。","imageUrl":"/images/personality/serene-explorer.webp"},"从容规划者":{"description":"你的计划不是为了控制，而是为了让自己可以更放松地享受过程。有条理给了你自由，而不是束缚——这个逻辑大多数人搞反了，但你天生就懂。","imageUrl":"/images/personality/serene-planner.webp"}},"scoring":{"minRaw":4.5,"maxRaw":18,"invertN":true}},"questions":[{"id":"quiz_1","builtinField":"quiz_1","sectionId":"quiz","type":"single","label":{"zh":"竹溪社的周末活动，你到了现场发现大部分人你都不认识。你会——","ja":"竹溪社的周末活动，你到了现场发现大部分人你都不认识。你会——"},"required":true,"active":true,"locked":true,"dimension":"E","options":[{"id":"option_1","value":"6","label":{"zh":"主动找看起来也是一个人的同学搭话","ja":"主动找看起来也是一个人的同学搭话"},"score":6},{"id":"option_2","value":"4.5","label":{"zh":"先观察一会儿，如果有人看过来就微笑回应","ja":"先观察一会儿，如果有人看过来就微笑回应"},"score":4.5},{"id":"option_3","value":"3","label":{"zh":"找到组织者让他们帮忙介绍","ja":"找到组织者让他们帮忙介绍"},"score":3},{"id":"option_4","value":"1.5","label":{"zh":"安静等活动正式开始，不急着认识人","ja":"安静等活动正式开始，不急着认识人"},"score":1.5}]},{"id":"quiz_2","builtinField":"quiz_2","sectionId":"quiz","type":"single","label":{"zh":"周五晚上，室友说隔壁研究室的同学约了一群人去居酒屋。你——","ja":"周五晚上，室友说隔壁研究室的同学约了一群人去居酒屋。你——"},"required":true,"active":true,"locked":true,"dimension":"E","options":[{"id":"option_1","value":"6","label":{"zh":"正好想出去，立刻答应","ja":"正好想出去，立刻答应"},"score":6},{"id":"option_2","value":"4.5","label":{"zh":"问一下大概几个人、去哪里，觉得还行就去","ja":"问一下大概几个人、去哪里，觉得还行就去"},"score":4.5},{"id":"option_3","value":"3","label":{"zh":"今天有点累，但室友很想去的话就陪一下","ja":"今天有点累，但室友很想去的话就陪一下"},"score":3},{"id":"option_4","value":"1.5","label":{"zh":"谢了，今晚就想一个人待着充充电","ja":"谢了，今晚就想一个人待着充充电"},"score":1.5}]},{"id":"quiz_3","builtinField":"quiz_3","sectionId":"quiz","type":"single","label":{"zh":"竹溪社线上发表会，主持人问「有没有人想分享最近的经历？」你——","ja":"竹溪社线上发表会，主持人问「有没有人想分享最近的经历？」你——"},"required":true,"active":true,"locked":true,"dimension":"E","options":[{"id":"option_1","value":"6","label":{"zh":"第一个开麦，正好有个有趣的故事","ja":"第一个开麦，正好有个有趣的故事"},"score":6},{"id":"option_2","value":"4.5","label":{"zh":"等别人先讲，如果氛围不错也会分享","ja":"等别人先讲，如果氛围不错也会分享"},"score":4.5},{"id":"option_3","value":"3","label":{"zh":"在聊天框打字分享，比开麦自在一些","ja":"在聊天框打字分享，比开麦自在一些"},"score":3},{"id":"option_4","value":"1.5","label":{"zh":"安静听别人讲就好，这种场合不太想说","ja":"安静听别人讲就好，这种场合不太想说"},"score":1.5}]},{"id":"quiz_4","builtinField":"quiz_4","sectionId":"quiz","type":"single","label":{"zh":"竹溪社多人活动中，小组需要决定策划方案，大家意见不一样。你倾向于——","ja":"竹溪社多人活动中，小组需要决定策划方案，大家意见不一样。你倾向于——"},"required":true,"active":true,"locked":true,"dimension":"A","options":[{"id":"option_1","value":"6","label":{"zh":"汇总大家的想法，尝试找到一个大家都接受的方案","ja":"汇总大家的想法，尝试找到一个大家都接受的方案"},"score":6},{"id":"option_2","value":"4.5","label":{"zh":"说出自己的想法，但如果多数人不同意就配合大家","ja":"说出自己的想法，但如果多数人不同意就配合大家"},"score":4.5},{"id":"option_3","value":"3","label":{"zh":"提议直接投票，按规则来最公平","ja":"提议直接投票，按规则来最公平"},"score":3},{"id":"option_4","value":"1.5","label":{"zh":"坚持自己觉得最好的方案，用逻辑说服大家","ja":"坚持自己觉得最好的方案，用逻辑说服大家"},"score":1.5}]},{"id":"quiz_5","builtinField":"quiz_5","sectionId":"quiz","type":"single","label":{"zh":"活动结束后一起吃饭，有个比较安静的同学一直没怎么说话。你——","ja":"活动结束后一起吃饭，有个比较安静的同学一直没怎么说话。你——"},"required":true,"active":true,"locked":true,"dimension":"A","options":[{"id":"option_1","value":"6","label":{"zh":"找个话题主动跟TA聊，让TA参与进来","ja":"找个话题主动跟TA聊，让TA参与进来"},"score":6},{"id":"option_2","value":"4.5","label":{"zh":"偶尔眼神交流一下，如果TA想加入自然会开口","ja":"偶尔眼神交流一下，如果TA想加入自然会开口"},"score":4.5},{"id":"option_3","value":"3","label":{"zh":"注意到了但不特别做什么，每个人有自己的节奏","ja":"注意到了但不特别做什么，每个人有自己的节奏"},"score":3},{"id":"option_4","value":"1.5","label":{"zh":"没怎么注意，自己聊得挺开心的","ja":"没怎么注意，自己聊得挺开心的"},"score":1.5}]},{"id":"quiz_6","builtinField":"quiz_6","sectionId":"quiz","type":"single","label":{"zh":"朋友向你借一笔不算小的钱，说下个月还。你——","ja":"朋友向你借一笔不算小的钱，说下个月还。你——"},"required":true,"active":true,"locked":true,"dimension":"A","options":[{"id":"option_1","value":"6","label":{"zh":"二话不说就借了，朋友之间不用计较","ja":"二话不说就借了，朋友之间不用计较"},"score":6},{"id":"option_2","value":"4.5","label":{"zh":"借了，但委婉提醒一下还款时间","ja":"借了，但委婉提醒一下还款时间"},"score":4.5},{"id":"option_3","value":"3","label":{"zh":"根据跟这个人的关系和信任程度决定借不借","ja":"根据跟这个人的关系和信任程度决定借不借"},"score":3},{"id":"option_4","value":"1.5","label":{"zh":"找个理由委婉拒绝，借钱的事容易伤感情","ja":"找个理由委婉拒绝，借钱的事容易伤感情"},"score":1.5}]},{"id":"quiz_7","builtinField":"quiz_7","sectionId":"quiz","type":"single","label":{"zh":"竹溪社推出了一个你从没尝试过的活动类型（比如即兴戏剧/户外写生/辩论赛）。你——","ja":"竹溪社推出了一个你从没尝试过的活动类型（比如即兴戏剧/户外写生/辩论赛）。你——"},"required":true,"active":true,"locked":true,"dimension":"O","options":[{"id":"option_1","value":"6","label":{"zh":"第一时间报名，没试过的东西才有意思","ja":"第一时间报名，没试过的东西才有意思"},"score":6},{"id":"option_2","value":"4.5","label":{"zh":"先了解一下规则和流程，觉得有趣就报","ja":"先了解一下规则和流程，觉得有趣就报"},"score":4.5},{"id":"option_3","value":"3","label":{"zh":"看看有没有朋友一起去，一个人不太想尝试新东西","ja":"看看有没有朋友一起去，一个人不太想尝试新东西"},"score":3},{"id":"option_4","value":"1.5","label":{"zh":"等下次有熟悉类型的活动再参加，不想踩雷","ja":"等下次有熟悉类型的活动再参加，不想踩雷"},"score":1.5}]},{"id":"quiz_8","builtinField":"quiz_8","sectionId":"quiz","type":"single","label":{"zh":"来日本后，有个日本同学邀请你参加他们研究室的忘年会。你——","ja":"来日本后，有个日本同学邀请你参加他们研究室的忘年会。你——"},"required":true,"active":true,"locked":true,"dimension":"O","options":[{"id":"option_1","value":"6","label":{"zh":"太好了，正想体验地道的日本文化","ja":"太好了，正想体验地道的日本文化"},"score":6},{"id":"option_2","value":"4.5","label":{"zh":"有点好奇，虽然日语不太好但愿意试试","ja":"有点好奇，虽然日语不太好但愿意试试"},"score":4.5},{"id":"option_3","value":"3","label":{"zh":"犹豫一下，问问有没有其他留学生也去","ja":"犹豫一下，问问有没有其他留学生也去"},"score":3},{"id":"option_4","value":"1.5","label":{"zh":"感觉融入不了，还是跟留学生朋友聚更自在","ja":"感觉融入不了，还是跟留学生朋友聚更自在"},"score":1.5}]},{"id":"quiz_9","builtinField":"quiz_9","sectionId":"quiz","type":"single","label":{"zh":"选餐厅吃饭，菜单上有一道你完全没见过的料理。你——","ja":"选餐厅吃饭，菜单上有一道你完全没见过的料理。你——"},"required":true,"active":true,"locked":true,"dimension":"O","options":[{"id":"option_1","value":"6","label":{"zh":"直接点了，就喜欢尝新的东西","ja":"直接点了，就喜欢尝新的东西"},"score":6},{"id":"option_2","value":"4.5","label":{"zh":"问一下店员这是什么，觉得能接受就试试","ja":"问一下店员这是什么，觉得能接受就试试"},"score":4.5},{"id":"option_3","value":"3","label":{"zh":"先看看别的桌有没有人点，看看实物再说","ja":"先看看别的桌有没有人点，看看实物再说"},"score":3},{"id":"option_4","value":"1.5","label":{"zh":"还是点自己吃过的，不想冒险踩雷","ja":"还是点自己吃过的，不想冒险踩雷"},"score":1.5}]},{"id":"quiz_10","builtinField":"quiz_10","sectionId":"quiz","type":"single","label":{"zh":"竹溪社活动通知说「请提前10分钟到达集合点」。你通常——","ja":"竹溪社活动通知说「请提前10分钟到达集合点」。你通常——"},"required":true,"active":true,"locked":true,"dimension":"C","options":[{"id":"option_1","value":"6","label":{"zh":"提前15-20分钟到，先熟悉一下环境","ja":"提前15-20分钟到，先熟悉一下环境"},"score":6},{"id":"option_2","value":"4.5","label":{"zh":"提前10分钟准时到达","ja":"提前10分钟准时到达"},"score":4.5},{"id":"option_3","value":"3","label":{"zh":"大约准时到，偶尔迟到一两分钟","ja":"大约准时到，偶尔迟到一两分钟"},"score":3},{"id":"option_4","value":"1.5","label":{"zh":"经常踩着点到或晚几分钟，差不多就行","ja":"经常踩着点到或晚几分钟，差不多就行"},"score":1.5}]},{"id":"quiz_11","builtinField":"quiz_11","sectionId":"quiz","type":"single","label":{"zh":"下周有一个重要的小组作业要交。今天是周日，你——","ja":"下周有一个重要的小组作业要交。今天是周日，你——"},"required":true,"active":true,"locked":true,"dimension":"C","options":[{"id":"option_1","value":"6","label":{"zh":"已经做完了，今天检查一遍就好","ja":"已经做完了，今天检查一遍就好"},"score":6},{"id":"option_2","value":"4.5","label":{"zh":"做了大半，今天集中精力收尾","ja":"做了大半，今天集中精力收尾"},"score":4.5},{"id":"option_3","value":"3","label":{"zh":"还没开始，但心里有个大致计划","ja":"还没开始，但心里有个大致计划"},"score":3},{"id":"option_4","value":"1.5","label":{"zh":"还没想呢，还有一周慢慢来","ja":"还没想呢，还有一周慢慢来"},"score":1.5}]},{"id":"quiz_12","builtinField":"quiz_12","sectionId":"quiz","type":"single","label":{"zh":"朋友约你明天出去玩。你——","ja":"朋友约你明天出去玩。你——"},"required":true,"active":true,"locked":true,"dimension":"C","options":[{"id":"option_1","value":"6","label":{"zh":"今晚就查好路线、餐厅和时间安排","ja":"今晚就查好路线、餐厅和时间安排"},"score":6},{"id":"option_2","value":"4.5","label":{"zh":"大概想一下去哪个方向，细节到时候再说","ja":"大概想一下去哪个方向，细节到时候再说"},"score":4.5},{"id":"option_3","value":"3","label":{"zh":"到时候再看吧，随机应变更有趣","ja":"到时候再看吧，随机应变更有趣"},"score":3},{"id":"option_4","value":"1.5","label":{"zh":"完全不想，走到哪算哪","ja":"完全不想，走到哪算哪"},"score":1.5}]},{"id":"quiz_13","builtinField":"quiz_13","sectionId":"quiz","type":"single","label":{"zh":"竹溪社给你匹配了一个完全不认识的搭档去玩双人本。出发前你——","ja":"竹溪社给你匹配了一个完全不认识的搭档去玩双人本。出发前你——"},"required":true,"active":true,"locked":true,"dimension":"N","options":[{"id":"option_1","value":"6","label":{"zh":"反复想「万一不合拍怎么办」「会不会冷场」","ja":"反复想「万一不合拍怎么办」「会不会冷场」"},"score":6},{"id":"option_2","value":"4.5","label":{"zh":"有点忐忑，但告诉自己试试看","ja":"有点忐忑，但告诉自己试试看"},"score":4.5},{"id":"option_3","value":"3","label":{"zh":"没什么特别感觉，到时候自然就好","ja":"没什么特别感觉，到时候自然就好"},"score":3},{"id":"option_4","value":"1.5","label":{"zh":"很期待，遇到新的人是一件有趣的事","ja":"很期待，遇到新的人是一件有趣的事"},"score":1.5}]},{"id":"quiz_14","builtinField":"quiz_14","sectionId":"quiz","type":"single","label":{"zh":"你在群里发了一条消息，过了半小时没人回复。你——","ja":"你在群里发了一条消息，过了半小时没人回复。你——"},"required":true,"active":true,"locked":true,"dimension":"N","options":[{"id":"option_1","value":"6","label":{"zh":"开始想是不是自己说了不合适的话","ja":"开始想是不是自己说了不合适的话"},"score":6},{"id":"option_2","value":"4.5","label":{"zh":"稍微有点在意，但提醒自己大家可能在忙","ja":"稍微有点在意，但提醒自己大家可能在忙"},"score":4.5},{"id":"option_3","value":"3","label":{"zh":"没怎么注意，想看到了自然会回","ja":"没怎么注意，想看到了自然会回"},"score":3},{"id":"option_4","value":"1.5","label":{"zh":"完全不在意这种事","ja":"完全不在意这种事"},"score":1.5}]},{"id":"quiz_15","builtinField":"quiz_15","sectionId":"quiz","type":"single","label":{"zh":"明天有一个重要的面试/发表。今天晚上你——","ja":"明天有一个重要的面试/发表。今天晚上你——"},"required":true,"active":true,"locked":true,"dimension":"N","options":[{"id":"option_1","value":"6","label":{"zh":"翻来覆去睡不着，脑子里反复预演各种意外","ja":"翻来覆去睡不着，脑子里反复预演各种意外"},"score":6},{"id":"option_2","value":"4.5","label":{"zh":"有点紧张，但还是能睡着","ja":"有点紧张，但还是能睡着"},"score":4.5},{"id":"option_3","value":"3","label":{"zh":"简单准备一下就睡了","ja":"简单准备一下就睡了"},"score":3},{"id":"option_4","value":"1.5","label":{"zh":"一点不紧张，该干嘛干嘛","ja":"一点不紧张，该干嘛干嘛"},"score":1.5}]}]}$baseline$::jsonb);

-- Additive, lazily initialized questionnaire versions. No member records are backfilled.
-- Public RPCs are invokers; privileged implementation lives in the unexposed private schema.
CREATE TABLE public.questionnaire_templates (
  kind text PRIMARY KEY CHECK (kind IN ('interview','supplementary','personality','quiz')),
  draft jsonb NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  baseline_version_id uuid,
  published_version_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.admin_users(id)
);
CREATE TABLE public.questionnaire_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL REFERENCES public.questionnaire_templates(kind),
  version integer NOT NULL CHECK (version > 0),
  template jsonb NOT NULL CHECK (jsonb_typeof(template) = 'object'),
  is_baseline boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.admin_users(id),
  UNIQUE(kind,version), UNIQUE(id,kind)
);
ALTER TABLE public.questionnaire_templates
  ADD CONSTRAINT questionnaire_baseline_fk FOREIGN KEY(baseline_version_id,kind) REFERENCES public.questionnaire_versions(id,kind),
  ADD CONSTRAINT questionnaire_published_fk FOREIGN KEY(published_version_id,kind) REFERENCES public.questionnaire_versions(id,kind);
CREATE TABLE public.questionnaire_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  kind text NOT NULL,
  version_id uuid NOT NULL,
  answers jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(answers)='object'),
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  completed_at timestamptz,
  legacy_imported boolean NOT NULL DEFAULT false,
  result_snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(version_id,kind) REFERENCES public.questionnaire_versions(id,kind),
  UNIQUE(id,member_id,kind)
);
CREATE INDEX questionnaire_responses_member_kind ON public.questionnaire_responses(member_id,kind,created_at DESC);
CREATE TABLE public.questionnaire_assignments (
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  kind text NOT NULL,
  response_id uuid NOT NULL,
  PRIMARY KEY(member_id,kind),
  FOREIGN KEY(response_id,member_id,kind) REFERENCES public.questionnaire_responses(id,member_id,kind) ON DELETE CASCADE
);
ALTER TABLE public.questionnaire_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questionnaire_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questionnaire_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questionnaire_assignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.questionnaire_templates,public.questionnaire_versions,public.questionnaire_responses,public.questionnaire_assignments FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.questionnaire_templates,public.questionnaire_versions,public.questionnaire_responses,public.questionnaire_assignments TO authenticated;
CREATE POLICY questionnaire_admin_read ON public.questionnaire_templates FOR SELECT TO authenticated USING ((SELECT private.member_master_is_admin()));
-- Versions contain only published question definitions, never drafts or member answers.
CREATE POLICY questionnaire_versions_read ON public.questionnaire_versions FOR SELECT TO authenticated USING ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY questionnaire_own_responses ON public.questionnaire_responses FOR SELECT TO authenticated USING (
  EXISTS(SELECT 1 FROM public.members m WHERE m.id=member_id AND m.user_id=(SELECT auth.uid())) OR (SELECT private.member_master_is_super_admin())
);
CREATE POLICY questionnaire_own_assignments ON public.questionnaire_assignments FOR SELECT TO authenticated USING (
  EXISTS(SELECT 1 FROM public.members m WHERE m.id=member_id AND m.user_id=(SELECT auth.uid())) OR (SELECT private.member_master_is_super_admin())
);

CREATE FUNCTION private.questionnaire_immutable_version() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'QUESTIONNAIRE_VERSION_IMMUTABLE' USING ERRCODE='42501'; END $$;
CREATE TRIGGER questionnaire_version_immutable BEFORE UPDATE OR DELETE ON public.questionnaire_versions FOR EACH ROW EXECUTE FUNCTION private.questionnaire_immutable_version();
CREATE FUNCTION private.questionnaire_protect_response() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.member_id<>OLD.member_id OR NEW.kind<>OLD.kind OR NEW.version_id<>OLD.version_id
    OR NOT EXISTS(SELECT 1 FROM public.questionnaire_assignments a WHERE a.response_id=OLD.id) THEN
    RAISE EXCEPTION 'QUESTIONNAIRE_HISTORY_IMMUTABLE' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER questionnaire_response_history BEFORE UPDATE ON public.questionnaire_responses FOR EACH ROW EXECUTE FUNCTION private.questionnaire_protect_response();
-- Existing anonymization owns erasure semantics. Locking members in every write prevents
-- a concurrent save from recreating snapshots after the existing scrub has committed.
CREATE FUNCTION private.questionnaire_erase_anonymized() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.anonymized_at IS NOT NULL AND OLD.anonymized_at IS NULL THEN
    DELETE FROM public.questionnaire_responses WHERE member_id=NEW.id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER questionnaire_member_erasure AFTER UPDATE OF anonymized_at ON public.members FOR EACH ROW EXECUTE FUNCTION private.questionnaire_erase_anonymized();

CREATE FUNCTION private.questionnaire_validate_template(p_kind text,p_template jsonb,p_baseline jsonb DEFAULT NULL) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE q jsonb; o jsonb; b jsonb; s jsonb; c jsonb; d jsonb; entry record; k text; dim text; mode text; part text; keys text[]:='{}'; ids text[]:='{}'; builtin_ids text[]:='{}'; option_ids text[]; option_values text[]; config_ids text[]:='{}'; weights numeric:=0;
BEGIN
  IF p_kind IS NULL OR p_kind NOT IN ('interview','supplementary','personality','quiz') OR p_template->>'kind' IS DISTINCT FROM p_kind
    OR jsonb_typeof(p_template) IS DISTINCT FROM 'object' OR pg_column_size(p_template)>262144
    OR jsonb_typeof(p_template->'title') IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_template->'sections') IS DISTINCT FROM 'array' OR jsonb_array_length(p_template->'sections') NOT BETWEEN 1 AND 30
    OR jsonb_typeof(p_template->'questions') IS DISTINCT FROM 'array' OR jsonb_array_length(p_template->'questions') NOT BETWEEN 1 AND 200
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_template) key WHERE key NOT IN ('kind','title','sections','questions','quizConfig'))
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_template->'title') key WHERE key NOT IN ('zh','ja')) THEN
    RAISE EXCEPTION 'QUESTIONNAIRE_TEMPLATE_INVALID' USING ERRCODE='22023';
  END IF;
  FOREACH k IN ARRAY ARRAY['zh','ja'] LOOP
    IF jsonb_typeof(p_template->'title'->k) IS DISTINCT FROM 'string' OR char_length(btrim(p_template->'title'->>k)) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'QUESTIONNAIRE_TITLE_INVALID' USING ERRCODE='22023'; END IF;
  END LOOP;
  IF p_baseline IS NOT NULL AND p_template->'sections' IS DISTINCT FROM p_baseline->'sections' THEN RAISE EXCEPTION 'QUESTIONNAIRE_SECTION_LOCKED' USING ERRCODE='23514'; END IF;
  FOR s IN SELECT value FROM jsonb_array_elements(p_template->'sections') LOOP
    IF jsonb_typeof(s) IS DISTINCT FROM 'object' OR (s->>'id') IS NULL OR (s->>'id') !~ '^[A-Za-z][A-Za-z0-9_-]{0,79}$'
      OR s->>'id' IN ('constructor','prototype','__proto__') OR s->>'id'=ANY(keys) OR jsonb_typeof(s->'title') IS DISTINCT FROM 'object'
      OR EXISTS(SELECT 1 FROM jsonb_object_keys(s) key WHERE key NOT IN ('id','title'))
      OR EXISTS(SELECT 1 FROM jsonb_object_keys(s->'title') key WHERE key NOT IN ('zh','ja')) THEN RAISE EXCEPTION 'QUESTIONNAIRE_SECTION_INVALID' USING ERRCODE='22023'; END IF;
    FOREACH k IN ARRAY ARRAY['zh','ja'] LOOP
      IF jsonb_typeof(s->'title'->k) IS DISTINCT FROM 'string' OR char_length(btrim(s->'title'->>k)) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'QUESTIONNAIRE_SECTION_INVALID' USING ERRCODE='22023'; END IF;
    END LOOP;
    keys:=array_append(keys,s->>'id');
  END LOOP;
  FOR q IN SELECT value FROM jsonb_array_elements(p_template->'questions') LOOP
    IF jsonb_typeof(q) IS DISTINCT FROM 'object' OR (q->>'id') IS NULL OR (q->>'id') !~ '^[A-Za-z][A-Za-z0-9_-]{0,79}$'
      OR q->>'id' IN ('constructor','prototype','__proto__') OR q->>'id'=ANY(ids)
      OR NOT COALESCE(q->>'sectionId'=ANY(keys),false) OR (q->>'type') IS NULL OR q->>'type' NOT IN ('text','textarea','single','multi','number','date','rating')
      OR jsonb_typeof(q->'required') IS DISTINCT FROM 'boolean' OR jsonb_typeof(q->'active') IS DISTINCT FROM 'boolean' OR jsonb_typeof(q->'locked') IS DISTINCT FROM 'boolean'
      OR jsonb_typeof(q->'label') IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(q->'label') key WHERE key NOT IN ('zh','ja'))
      OR EXISTS(SELECT 1 FROM jsonb_object_keys(q) key WHERE key NOT IN ('id','builtinField','sectionId','type','label','description','required','active','options','min','max','maxLength','maxSelections','locked','dimension')) THEN
      RAISE EXCEPTION 'QUESTIONNAIRE_QUESTION_INVALID' USING ERRCODE='22023';
    END IF;
    FOREACH k IN ARRAY ARRAY['zh','ja'] LOOP
      IF jsonb_typeof(q->'label'->k) IS DISTINCT FROM 'string' OR char_length(btrim(q->'label'->>k)) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'QUESTIONNAIRE_QUESTION_INVALID' USING ERRCODE='22023'; END IF;
      IF q ? 'description' AND (jsonb_typeof(q->'description') IS DISTINCT FROM 'object' OR jsonb_typeof(q->'description'->k) IS DISTINCT FROM 'string' OR char_length(q->'description'->>k)>4000) THEN RAISE EXCEPTION 'QUESTIONNAIRE_QUESTION_INVALID' USING ERRCODE='22023'; END IF;
    END LOOP;
    IF q ? 'description' AND EXISTS(SELECT 1 FROM jsonb_object_keys(q->'description') key WHERE key NOT IN ('zh','ja')) THEN RAISE EXCEPTION 'QUESTIONNAIRE_QUESTION_INVALID' USING ERRCODE='22023'; END IF;
    ids:=array_append(ids,q->>'id');
    IF q ? 'builtinField' THEN
      IF jsonb_typeof(q->'builtinField') IS DISTINCT FROM 'string' OR (q->>'builtinField') !~ '^[A-Za-z][A-Za-z0-9_-]{0,79}$' OR q->>'builtinField' IN ('constructor','prototype','__proto__') OR q->>'builtinField'=ANY(builtin_ids) THEN RAISE EXCEPTION 'QUESTIONNAIRE_MAPPING_INVALID' USING ERRCODE='22023'; END IF;
      builtin_ids:=array_append(builtin_ids,q->>'builtinField');
    END IF;
    IF EXISTS(SELECT 1 FROM jsonb_each(q) e WHERE e.key IN ('min','max','maxLength','maxSelections') AND (jsonb_typeof(e.value)<>'number' OR abs((e.value#>>'{}')::numeric)>1.7976931348623157e308))
      OR (q ? 'min' AND q ? 'max' AND (q->>'min')::numeric>(q->>'max')::numeric)
      OR (q ? 'maxLength' AND ((q->>'maxLength')::numeric NOT BETWEEN 1 AND 20000 OR (q->>'maxLength')::numeric<>trunc((q->>'maxLength')::numeric)))
      OR (q ? 'maxSelections' AND (q->>'type'<>'multi' OR (q->>'maxSelections')::numeric NOT BETWEEN 1 AND 200 OR (q->>'maxSelections')::numeric<>trunc((q->>'maxSelections')::numeric)))
      OR (q->>'type' IN ('text','textarea') AND q ? 'min' AND ((q->>'min')::numeric<0 OR (q->>'min')::numeric>COALESCE((q->>'maxLength')::numeric,20000) OR (q->>'min')::numeric<>trunc((q->>'min')::numeric)))
      OR (q->>'type'='rating' AND (NOT q ?& ARRAY['min','max'] OR (q->>'min')::numeric<0 OR (q->>'max')::numeric>100 OR (q->>'max')::numeric<=(q->>'min')::numeric OR (q->>'min')::numeric<>trunc((q->>'min')::numeric) OR (q->>'max')::numeric<>trunc((q->>'max')::numeric))) THEN RAISE EXCEPTION 'QUESTIONNAIRE_BOUNDS_INVALID' USING ERRCODE='22023'; END IF;
    IF q->>'type' IN ('single','multi') THEN
      IF jsonb_typeof(q->'options') IS DISTINCT FROM 'array' OR jsonb_array_length(q->'options') NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'QUESTIONNAIRE_OPTIONS_INVALID' USING ERRCODE='22023'; END IF;
      option_ids:='{}'; option_values:='{}';
      FOR o IN SELECT value FROM jsonb_array_elements(q->'options') LOOP
        IF jsonb_typeof(o) IS DISTINCT FROM 'object' OR jsonb_typeof(o->'id') IS DISTINCT FROM 'string' OR (o->>'id') !~ '^[A-Za-z][A-Za-z0-9_-]{0,79}$' OR o->>'id' IN ('constructor','prototype','__proto__') OR o->>'id'=ANY(option_ids)
          OR jsonb_typeof(o->'value') IS DISTINCT FROM 'string' OR NULLIF(btrim(o->>'value'),'') IS NULL OR o->>'value'=ANY(option_values) OR char_length(o->>'value')>100 OR o->>'value' IN ('constructor','prototype','__proto__')
          OR jsonb_typeof(o->'label') IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(o->'label') key WHERE key NOT IN ('zh','ja'))
          OR EXISTS(SELECT 1 FROM jsonb_object_keys(o) key WHERE key NOT IN ('id','value','label','score'))
          OR (o ? 'score' AND (jsonb_typeof(o->'score')<>'number' OR abs((o->>'score')::numeric)>1.7976931348623157e308))
          OR (q ? 'dimension' AND (jsonb_typeof(o->'score') IS DISTINCT FROM 'number' OR (o->>'score')::numeric NOT BETWEEN 0 AND 1000))
          OR (q->>'builtinField' IN ('enrollment_year','graduation_year') AND ((o->>'value') !~ '^[0-9]{4}$' OR (o->>'value')::numeric NOT BETWEEN 1900 AND 2100)) THEN RAISE EXCEPTION 'QUESTIONNAIRE_OPTIONS_INVALID' USING ERRCODE='22023'; END IF;
        FOREACH k IN ARRAY ARRAY['zh','ja'] LOOP
          IF jsonb_typeof(o->'label'->k) IS DISTINCT FROM 'string' OR char_length(btrim(o->'label'->>k)) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'QUESTIONNAIRE_OPTIONS_INVALID' USING ERRCODE='22023'; END IF;
        END LOOP;
        option_ids:=array_append(option_ids,o->>'id');option_values:=array_append(option_values,o->>'value');
      END LOOP;
      IF q ? 'maxSelections' AND (q->>'maxSelections')::integer>jsonb_array_length(q->'options') THEN RAISE EXCEPTION 'QUESTIONNAIRE_BOUNDS_INVALID' USING ERRCODE='22023'; END IF;
    ELSIF q ? 'options' AND q->'options'<>'[]'::jsonb THEN RAISE EXCEPTION 'QUESTIONNAIRE_OPTIONS_INVALID' USING ERRCODE='22023';
    END IF;
    IF q ? 'dimension' AND (p_kind<>'quiz' OR q->>'dimension' IS NULL OR q->>'dimension' NOT IN ('E','A','O','C','N') OR q->>'type'<>'single'
      OR ((q->>'active')::boolean AND (jsonb_array_length(q->'options') NOT BETWEEN 2 AND 100 OR EXISTS(SELECT 1 FROM jsonb_array_elements(q->'options') scored_option WHERE char_length(scored_option#>>'{label,zh}')>1000)))) THEN RAISE EXCEPTION 'QUESTIONNAIRE_DIMENSION_INVALID' USING ERRCODE='22023'; END IF;
    IF p_baseline IS NOT NULL THEN
      SELECT value INTO b FROM jsonb_array_elements(p_baseline->'questions') WHERE value->>'id'=q->>'id';
      IF b IS NULL AND (q ? 'builtinField' OR (q->>'locked')::boolean) THEN RAISE EXCEPTION 'QUESTIONNAIRE_MAPPING_INVALID' USING ERRCODE='23514'; END IF;
      IF b IS NOT NULL AND (q->'builtinField' IS DISTINCT FROM b->'builtinField' OR q->'locked' IS DISTINCT FROM b->'locked') THEN RAISE EXCEPTION 'QUESTIONNAIRE_BUILTIN_LOCKED' USING ERRCODE='23514'; END IF;
      IF b IS NOT NULL AND q->>'type'=b->>'type' AND EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(b->'options','[]')) old WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(q->'options','[]')) new WHERE old->'id'=new->'id' AND old->'value'=new->'value')) THEN RAISE EXCEPTION 'QUESTIONNAIRE_OPTION_LOCKED' USING ERRCODE='23514'; END IF;
      IF b IS NOT NULL AND (b->>'locked')::boolean AND (q->>'type'<>b->>'type' OR q->>'sectionId'<>b->>'sectionId'
        OR (q->>'builtinField' IN ('gender','degree_level','accept_beginners','accept_cross_school') AND jsonb_array_length(q->'options')<>jsonb_array_length(b->'options'))
        OR EXISTS(SELECT 1 FROM jsonb_each(b) bound WHERE bound.key IN ('max','maxLength','maxSelections') AND (NOT q ? bound.key OR (q->>bound.key)::numeric>(bound.value#>>'{}')::numeric))
        OR (b ? 'min' AND (NOT q ? 'min' OR (q->>'min')::numeric<(b->>'min')::numeric))) THEN RAISE EXCEPTION 'QUESTIONNAIRE_BUILTIN_LOCKED' USING ERRCODE='23514'; END IF;
      IF p_kind='interview' AND q->>'builtinField' IN ('full_name','gender','birth_date','nationality','current_city','school_name','degree_level','hobby_tags','activity_type_tags','personality_self_tags') AND (q->>'required'<>'true' OR q->>'active'<>'true') THEN RAISE EXCEPTION 'QUESTIONNAIRE_BUILTIN_LOCKED' USING ERRCODE='23514'; END IF;
    END IF;
  END LOOP;
  IF p_baseline IS NOT NULL AND EXISTS(SELECT 1 FROM jsonb_array_elements(p_baseline->'questions') old WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_template->'questions') new WHERE old->>'id'=new->>'id')) THEN RAISE EXCEPTION 'QUESTIONNAIRE_QUESTION_REMOVED' USING ERRCODE='23514'; END IF;
  IF p_kind<>'quiz' THEN
    IF p_template ? 'quizConfig' THEN RAISE EXCEPTION 'QUESTIONNAIRE_SCORING_INVALID' USING ERRCODE='22023'; END IF;
    RETURN;
  END IF;
  c:=p_template->'quizConfig';
  IF jsonb_typeof(c) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(c) key WHERE key NOT IN ('questions','dimensions','typeLabels','typeDescriptions','scoring'))
    OR jsonb_typeof(c->'scoring') IS DISTINCT FROM 'object' OR jsonb_typeof(c#>'{scoring,minRaw}') IS DISTINCT FROM 'number' OR jsonb_typeof(c#>'{scoring,maxRaw}') IS DISTINCT FROM 'number'
    OR (c#>>'{scoring,minRaw}')::numeric<0 OR (c#>>'{scoring,maxRaw}')::numeric>1000000 OR (c#>>'{scoring,maxRaw}')::numeric<=(c#>>'{scoring,minRaw}')::numeric OR jsonb_typeof(c#>'{scoring,invertN}') IS DISTINCT FROM 'boolean'
    OR jsonb_typeof(c->'dimensions') IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(c->'dimensions'))<>5
    OR jsonb_typeof(c->'typeLabels') IS DISTINCT FROM 'object' OR jsonb_typeof(c->'typeDescriptions') IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(c->'typeDescriptions'))>200
    OR jsonb_typeof(c->'questions') IS DISTINCT FROM 'array' OR jsonb_array_length(c->'questions') NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'QUESTIONNAIRE_SCORING_INVALID' USING ERRCODE='22023'; END IF;
  FOREACH dim IN ARRAY ARRAY['E','A','O','C','N'] LOOP
    d:=c->'dimensions'->dim;
    IF jsonb_typeof(d) IS DISTINCT FROM 'object' OR jsonb_typeof(d->'name') IS DISTINCT FROM 'string' OR char_length(btrim(d->>'name')) NOT BETWEEN 1 AND 100 OR jsonb_typeof(d->'matchWeight') IS DISTINCT FROM 'number' OR (d->>'matchWeight')::numeric NOT BETWEEN 0 AND 1 OR jsonb_typeof(d->'descriptions') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'QUESTIONNAIRE_DIMENSION_INVALID' USING ERRCODE='22023'; END IF;
    FOREACH k IN ARRAY ARRAY['low','mid','high'] LOOP
      IF jsonb_typeof(d->'descriptions'->k) IS DISTINCT FROM 'string' OR char_length(btrim(d->'descriptions'->>k)) NOT BETWEEN 1 AND 4000 THEN RAISE EXCEPTION 'QUESTIONNAIRE_DIMENSION_INVALID' USING ERRCODE='22023'; END IF;
    END LOOP;
    weights:=weights+(d->>'matchWeight')::numeric;
    IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_template->'questions') x WHERE (x->>'active')::boolean AND x->>'dimension'=dim) THEN RAISE EXCEPTION 'QUESTIONNAIRE_DIMENSION_INVALID' USING ERRCODE='22023'; END IF;
  END LOOP;
  IF abs(weights-1)>0.000001 THEN RAISE EXCEPTION 'QUESTIONNAIRE_DIMENSION_WEIGHTS_INVALID' USING ERRCODE='22023'; END IF;
  FOREACH mode IN ARRAY ARRAY['formal','fun'] LOOP
    FOREACH part IN ARRAY ARRAY['prefix','suffix'] LOOP
      d:=c#>ARRAY['typeLabels',mode,part];
      IF jsonb_typeof(d) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(d) key WHERE key IN ('constructor','prototype','__proto__')) THEN RAISE EXCEPTION 'QUESTIONNAIRE_NAMING_INVALID' USING ERRCODE='22023'; END IF;
      FOREACH dim IN ARRAY ARRAY['E','A','O','C','ES'] LOOP
        IF jsonb_typeof(d->dim) IS DISTINCT FROM 'string' OR char_length(btrim(d->>dim)) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'QUESTIONNAIRE_NAMING_INVALID' USING ERRCODE='22023'; END IF;
      END LOOP;
    END LOOP;
  END LOOP;
  FOR entry IN SELECT key,value FROM jsonb_each(c->'typeDescriptions') LOOP
    IF char_length(btrim(entry.key)) NOT BETWEEN 1 AND 100 OR entry.key IN ('constructor','prototype','__proto__') OR jsonb_typeof(entry.value) IS DISTINCT FROM 'object' OR jsonb_typeof(entry.value->'description') IS DISTINCT FROM 'string' OR char_length(btrim(entry.value->>'description')) NOT BETWEEN 1 AND 4000
      OR (entry.value ? 'imageUrl' AND (jsonb_typeof(entry.value->'imageUrl') IS DISTINCT FROM 'string' OR char_length(entry.value->>'imageUrl') NOT BETWEEN 1 AND 2000 OR (entry.value->>'imageUrl') !~ '^(/[^/]|https://)')) THEN RAISE EXCEPTION 'QUESTIONNAIRE_DESCRIPTION_INVALID' USING ERRCODE='22023'; END IF;
  END LOOP;
  FOR q IN SELECT value FROM jsonb_array_elements(c->'questions') LOOP
    IF jsonb_typeof(q) IS DISTINCT FROM 'object' OR jsonb_typeof(q->'id') IS DISTINCT FROM 'number' OR (q->>'id')::numeric NOT BETWEEN 1 AND 9007199254740991 OR (q->>'id')::numeric<>trunc((q->>'id')::numeric) OR q->>'id'=ANY(config_ids)
      OR q->>'dimension' IS NULL OR q->>'dimension' NOT IN ('E','A','O','C','N') OR jsonb_typeof(q->'text') IS DISTINCT FROM 'string' OR char_length(btrim(q->>'text')) NOT BETWEEN 1 AND 2000 OR jsonb_typeof(q->'options') IS DISTINCT FROM 'array' OR jsonb_array_length(q->'options') NOT BETWEEN 2 AND 100 THEN RAISE EXCEPTION 'QUESTIONNAIRE_SCORING_INVALID' USING ERRCODE='22023'; END IF;
    config_ids:=array_append(config_ids,q->>'id');
    FOR o IN SELECT value FROM jsonb_array_elements(q->'options') LOOP
      IF jsonb_typeof(o) IS DISTINCT FROM 'object' OR jsonb_typeof(o->'text') IS DISTINCT FROM 'string' OR char_length(btrim(o->>'text')) NOT BETWEEN 1 AND 1000 OR jsonb_typeof(o->'score') IS DISTINCT FROM 'number' OR (o->>'score')::numeric NOT BETWEEN 0 AND 1000 THEN RAISE EXCEPTION 'QUESTIONNAIRE_SCORING_INVALID' USING ERRCODE='22023'; END IF;
    END LOOP;
  END LOOP;
END $$;

CREATE FUNCTION private.questionnaire_validate_answers(p_template jsonb,p_answers jsonb,p_section text DEFAULT NULL,p_complete boolean DEFAULT true,p_existing jsonb DEFAULT '{}') RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE q jsonb; v jsonb; t text; prose text; empty_value boolean; required_now boolean; known boolean; retained boolean; boolean_field boolean; year_field boolean;
BEGIN
  IF jsonb_typeof(p_answers) IS DISTINCT FROM 'object' OR pg_column_size(p_answers)>131072 OR EXISTS(
    SELECT 1 FROM jsonb_object_keys(p_answers) k WHERE k IN ('constructor','prototype','__proto__') OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_template->'questions') AS question(definition) WHERE question.definition->>'id'=k)
  ) THEN RAISE EXCEPTION 'QUESTIONNAIRE_ANSWERS_INVALID' USING ERRCODE='22023'; END IF;
  IF p_section IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_template->'sections') s WHERE s->>'id'=p_section) THEN RAISE EXCEPTION 'QUESTIONNAIRE_SECTION_INVALID' USING ERRCODE='22023'; END IF;
  FOR q IN SELECT value FROM jsonb_array_elements(p_template->'questions') LOOP
    IF NOT (q->>'active')::boolean THEN
      IF p_answers ? (q->>'id') AND p_answers->(q->>'id') IS DISTINCT FROM p_existing->(q->>'id') THEN RAISE EXCEPTION 'QUESTIONNAIRE_INACTIVE_ANSWER' USING ERRCODE='22023'; END IF;
      CONTINUE;
    END IF;
    v:=p_answers->(q->>'id');t:=q->>'type';
    empty_value:=v IS NULL OR v='null'::jsonb OR v='""'::jsonb OR v='[]'::jsonb;
    required_now:=(q->>'required')::boolean AND p_complete AND (p_section IS NULL OR q->>'sectionId'=p_section);
    IF empty_value THEN
      IF required_now THEN RAISE EXCEPTION 'QUESTIONNAIRE_REQUIRED:%',q->>'id' USING ERRCODE='23514'; END IF;
      CONTINUE;
    END IF;
    IF t IN ('text','textarea','date') THEN
      IF jsonb_typeof(v)<>'string' THEN RAISE EXCEPTION 'QUESTIONNAIRE_ANSWER_TYPE:%',q->>'id' USING ERRCODE='22023'; END IF;
      prose:=btrim(v#>>'{}');
      IF q->>'builtinField'='nickname' THEN prose:=btrim(normalize(prose,NFKC)); END IF;
      IF char_length(prose)>COALESCE((q->>'maxLength')::integer,20000) OR (t<>'date' AND char_length(prose)<COALESCE((q->>'min')::integer,0)) OR (required_now AND prose='') THEN RAISE EXCEPTION 'QUESTIONNAIRE_ANSWER_TYPE:%',q->>'id' USING ERRCODE='22023'; END IF;
      IF t='date' AND ((v#>>'{}') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR to_char((v#>>'{}')::date,'YYYY-MM-DD')<>v#>>'{}' OR (q->>'builtinField'='birth_date' AND ((v#>>'{}')::date<'1900-01-01'::date OR (v#>>'{}')::date>(now() AT TIME ZONE 'Asia/Tokyo')::date))) THEN RAISE EXCEPTION 'QUESTIONNAIRE_DATE_INVALID' USING ERRCODE='22023'; END IF;
    ELSIF t IN ('number','rating') THEN
      IF jsonb_typeof(v)<>'number' OR abs((v#>>'{}')::numeric)>1.7976931348623157e308 OR (t='rating' AND (v#>>'{}')::numeric<>trunc((v#>>'{}')::numeric)) OR (q ? 'min' AND (v#>>'{}')::numeric<(q->>'min')::numeric) OR (q ? 'max' AND (v#>>'{}')::numeric>(q->>'max')::numeric) THEN RAISE EXCEPTION 'QUESTIONNAIRE_NUMBER_INVALID:%',q->>'id' USING ERRCODE='22023'; END IF;
    ELSIF t='single' THEN
      boolean_field:=COALESCE(q->>'builtinField' IN ('accept_beginners','accept_cross_school'),false);
      year_field:=COALESCE(q->>'builtinField' IN ('enrollment_year','graduation_year'),false);
      known:=EXISTS(SELECT 1 FROM jsonb_array_elements(q->'options') o WHERE o->>'value'=v#>>'{}');
      retained:=COALESCE(p_existing->(q->>'id')=v,false) AND ((jsonb_typeof(v)='string' AND char_length(v#>>'{}')<=100) OR (year_field AND jsonb_typeof(v)='number' AND (v#>>'{}')::numeric=trunc((v#>>'{}')::numeric) AND (v#>>'{}')::numeric BETWEEN 1900 AND 2100));
      IF jsonb_typeof(v) NOT IN ('string','boolean','number') OR (jsonb_typeof(v)='number' AND NOT (year_field OR q ? 'dimension')) OR (jsonb_typeof(v)='boolean' AND NOT boolean_field) OR (boolean_field AND jsonb_typeof(v)<>'boolean')
        OR (year_field AND (jsonb_typeof(v)<>'number' OR (v#>>'{}')::numeric<>trunc((v#>>'{}')::numeric) OR (v#>>'{}')::numeric NOT BETWEEN 1900 AND 2100)) OR NOT (known OR retained) THEN RAISE EXCEPTION 'QUESTIONNAIRE_OPTION_INVALID:%',q->>'id' USING ERRCODE='22023'; END IF;
    ELSIF t='multi' THEN
      IF jsonb_typeof(v)<>'array' THEN RAISE EXCEPTION 'QUESTIONNAIRE_ANSWER_TYPE:%',q->>'id' USING ERRCODE='22023'; END IF;
      IF jsonb_array_length(v)>COALESCE((q->>'maxSelections')::integer,jsonb_array_length(q->'options'),200) OR (SELECT count(*)<>count(DISTINCT x) FROM jsonb_array_elements(v) x)
        OR EXISTS(SELECT 1 FROM jsonb_array_elements(v) x WHERE jsonb_typeof(x)<>'string' OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(q->'options') o WHERE o->'value'=x) AND NOT (COALESCE(p_existing->(q->>'id'),'[]') @> jsonb_build_array(x) AND char_length(x#>>'{}')<=100)) THEN RAISE EXCEPTION 'QUESTIONNAIRE_OPTIONS_INVALID:%',q->>'id' USING ERRCODE='22023'; END IF;
    END IF;
  END LOOP;
END $$;

CREATE FUNCTION private.questionnaire_admin_list() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT private.member_master_is_admin() THEN RAISE EXCEPTION 'QUESTIONNAIRE_ADMIN_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('kind',t.kind,'baseline',b.template,'draft',t.draft,'published',p.template,'revision',t.revision,
    'versions',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',v.id,'version',v.version,'createdAt',v.created_at,'createdBy',v.created_by) ORDER BY v.version DESC),'[]') FROM public.questionnaire_versions v WHERE v.kind=t.kind)) ORDER BY t.kind),'[]') INTO result
  FROM public.questionnaire_templates t LEFT JOIN public.questionnaire_versions b ON b.id=t.baseline_version_id LEFT JOIN public.questionnaire_versions p ON p.id=t.published_version_id;
  RETURN result;
END $$;

CREATE FUNCTION private.questionnaire_trusted_baseline(p_kind text) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE template jsonb; config jsonb; questions jsonb;
BEGIN
  SELECT d.template INTO template FROM private.questionnaire_baseline_definitions d WHERE d.kind=p_kind;
  IF template IS NULL THEN RAISE EXCEPTION 'QUESTIONNAIRE_KIND_INVALID' USING ERRCODE='22023'; END IF;
  IF p_kind='quiz' THEN
    SELECT jsonb_build_object('questions',q.questions,'dimensions',q.dimensions,'typeLabels',q.type_labels,'typeDescriptions',q.type_descriptions,'scoring',q.scoring)
      INTO config FROM public.personality_quiz_config q LIMIT 1;
    config:=COALESCE(config,template->'quizConfig');
    SELECT jsonb_agg(jsonb_build_object('id','quiz_'||(q->>'id'),'builtinField','quiz_'||(q->>'id'),'sectionId','quiz','type','single',
      'label',jsonb_build_object('zh',q->>'text','ja',q->>'text'),'required',true,'active',true,'locked',true,'dimension',q->>'dimension',
      'options',(SELECT jsonb_agg(jsonb_build_object('id','option_'||ordinality,'value',(o->>'score')::double precision::text,
        'label',jsonb_build_object('zh',o->>'text','ja',o->>'text'),'score',o->'score') ORDER BY ordinality)
        FROM jsonb_array_elements(q->'options') WITH ORDINALITY options(o,ordinality))) ORDER BY ordinality)
      INTO questions FROM jsonb_array_elements(config->'questions') WITH ORDINALITY question(q,ordinality);
    template:=jsonb_set(jsonb_set(template,'{quizConfig}',config),'{questions}',questions);
  END IF;
  RETURN template;
END $$;

CREATE FUNCTION private.questionnaire_initialize(p_kind text,p_template jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_id uuid; v_admin uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT private.member_master_is_admin() THEN RAISE EXCEPTION 'QUESTIONNAIRE_ADMIN_REQUIRED' USING ERRCODE='42501'; END IF;
  v_admin:=private.member_master_current_admin_id();
  PERFORM pg_advisory_xact_lock(hashtextextended('questionnaire.initialize.'||p_kind,0));
  IF EXISTS(SELECT 1 FROM public.questionnaire_templates WHERE kind=p_kind) THEN RETURN private.questionnaire_admin_list(); END IF;
  IF p_template IS DISTINCT FROM private.questionnaire_trusted_baseline(p_kind) THEN
    RAISE EXCEPTION 'QUESTIONNAIRE_BASELINE_UNTRUSTED' USING ERRCODE='42501';
  END IF;
  PERFORM private.questionnaire_validate_template(p_kind,p_template);
  INSERT INTO public.questionnaire_templates(kind,draft,updated_by) VALUES(p_kind,p_template,v_admin);
  INSERT INTO public.questionnaire_versions(kind,version,template,is_baseline,created_by) VALUES(p_kind,1,p_template,true,v_admin) RETURNING id INTO v_id;
  UPDATE public.questionnaire_templates SET baseline_version_id=v_id,published_version_id=v_id WHERE kind=p_kind;
  RETURN private.questionnaire_admin_list();
END $$;

CREATE FUNCTION private.questionnaire_save_draft(p_kind text,p_expected_revision integer,p_template jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.questionnaire_templates%ROWTYPE; b jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT private.member_master_is_admin() THEN RAISE EXCEPTION 'QUESTIONNAIRE_ADMIN_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO t FROM public.questionnaire_templates WHERE kind=p_kind FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'QUESTIONNAIRE_NOT_INITIALIZED' USING ERRCODE='22023'; END IF;
  IF p_expected_revision IS DISTINCT FROM t.revision THEN RAISE EXCEPTION 'QUESTIONNAIRE_REVISION_CONFLICT' USING ERRCODE='PT409'; END IF;
  SELECT template INTO b FROM public.questionnaire_versions WHERE id=t.baseline_version_id;
  PERFORM private.questionnaire_validate_template(p_kind,p_template,b);
  PERFORM private.questionnaire_validate_template(p_kind,p_template,t.draft);
  UPDATE public.questionnaire_templates SET draft=p_template,revision=revision+1,updated_at=now(),updated_by=private.member_master_current_admin_id() WHERE kind=p_kind;
  RETURN (SELECT x FROM jsonb_array_elements(private.questionnaire_admin_list()) x WHERE x->>'kind'=p_kind);
END $$;

CREATE FUNCTION private.questionnaire_publish(p_kind text,p_expected_revision integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.questionnaire_templates%ROWTYPE; b jsonb; v_id uuid; v_number integer;
BEGIN
  IF auth.uid() IS NULL OR NOT private.member_master_is_super_admin() THEN RAISE EXCEPTION 'QUESTIONNAIRE_SUPER_ADMIN_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO t FROM public.questionnaire_templates WHERE kind=p_kind FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'QUESTIONNAIRE_NOT_INITIALIZED' USING ERRCODE='22023'; END IF;
  IF p_expected_revision IS DISTINCT FROM t.revision THEN RAISE EXCEPTION 'QUESTIONNAIRE_REVISION_CONFLICT' USING ERRCODE='PT409'; END IF;
  SELECT template INTO b FROM public.questionnaire_versions WHERE id=t.baseline_version_id;
  PERFORM private.questionnaire_validate_template(p_kind,t.draft,b);
  SELECT max(version)+1 INTO v_number FROM public.questionnaire_versions WHERE kind=p_kind;
  INSERT INTO public.questionnaire_versions(kind,version,template,is_baseline,created_by) VALUES(p_kind,v_number,t.draft,t.draft=b,private.member_master_current_admin_id()) RETURNING id INTO v_id;
  UPDATE public.questionnaire_templates SET published_version_id=v_id,revision=revision+1,updated_at=now(),updated_by=private.member_master_current_admin_id() WHERE kind=p_kind;
  RETURN (SELECT x FROM jsonb_array_elements(private.questionnaire_admin_list()) x WHERE x->>'kind'=p_kind);
END $$;

-- Project legacy rows only into existing built-in question IDs. Imported snapshots
-- retain their original result; reads never validate or demand newly required answers.
CREATE FUNCTION private.questionnaire_legacy(p_member uuid,p_kind text,p_template jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE source jsonb:='{}'; result jsonb:='{}'; answers jsonb:='{}'; q jsonb; a jsonb; m public.members%ROWTYPE; has_answers boolean:=false; done boolean:=false; lang jsonb;
BEGIN
  SELECT * INTO m FROM public.members WHERE id=p_member;
  IF p_kind='interview' THEN
    SELECT to_jsonb(x) INTO source FROM public.member_identity x WHERE member_id=p_member;
    has_answers:=m.onboarding_step>0 OR m.profile_stage IN ('submitted','complete') OR NULLIF(source->>'full_name','') IS NOT NULL;
    done:=m.profile_stage IN ('submitted','complete') OR m.status='approved';
  ELSIF p_kind='supplementary' THEN
    SELECT to_jsonb(x) INTO source FROM public.member_interests x WHERE member_id=p_member;
    SELECT to_jsonb(x) INTO lang FROM public.member_language x WHERE member_id=p_member;
    source:=COALESCE(source,'{}')||COALESCE(lang,'{}');
    has_answers:=lang IS NOT NULL OR EXISTS(SELECT 1 FROM jsonb_each(source) e WHERE e.key NOT IN ('id','member_id','created_at','updated_at','accept_beginners','accept_cross_school') AND e.value NOT IN ('null','""','[]','{}'))
      OR source->'accept_beginners'='false'::jsonb OR source->'accept_cross_school'='false'::jsonb;
    IF NOT COALESCE(has_answers,false) THEN source:=source||'{"accept_beginners":null,"accept_cross_school":null}'; END IF;
    done:=COALESCE(has_answers,false);
  ELSIF p_kind='personality' THEN
    SELECT to_jsonb(x) INTO source FROM public.member_personality x WHERE member_id=p_member;
    has_answers:=EXISTS(SELECT 1 FROM jsonb_each(COALESCE(source,'{}')) e WHERE e.key IN ('extroversion','initiative','emotional_stability') AND e.value<>'3')
      OR EXISTS(SELECT 1 FROM jsonb_each(COALESCE(source,'{}')) e WHERE e.key IN ('expression_style_tags','group_role_tags','warmup_speed','planning_style','coop_compete_tendency','boundary_strength','reply_speed') AND e.value NOT IN ('null','""','[]'));
    IF NOT has_answers THEN source:=COALESCE(source,'{}')||'{"extroversion":null,"initiative":null,"emotional_stability":null}'; END IF;
    done:=has_answers;
  ELSIF p_kind='quiz' THEN
    SELECT to_jsonb(x) INTO result FROM public.personality_quiz_results x WHERE member_id=p_member;
    has_answers:=result IS NOT NULL; done:=has_answers;
    FOR a IN SELECT value FROM jsonb_array_elements(COALESCE(result->'answers','[]')) LOOP
      IF a ? 'questionId' AND a ? 'score' THEN answers:=answers||jsonb_build_object('quiz_'||(a->>'questionId'),a->'score'); END IF;
    END LOOP;
  END IF;
  IF p_kind<>'quiz' THEN
    FOR q IN SELECT value FROM jsonb_array_elements(p_template->'questions') WHERE value ? 'builtinField' LOOP
      IF COALESCE(source,'{}') ? (q->>'builtinField') THEN answers:=answers||jsonb_build_object(q->>'id',source->(q->>'builtinField')); END IF;
    END LOOP;
  END IF;
  RETURN jsonb_build_object('exists',COALESCE(has_answers,false),'completed',COALESCE(done,false),'answers',answers,'result',result);
END $$;

CREATE FUNCTION private.questionnaire_member(p_kind text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_id uuid; m public.members%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'QUESTIONNAIRE_AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
  IF p_kind NOT IN ('interview','supplementary','personality','quiz') OR p_kind IS NULL THEN RAISE EXCEPTION 'QUESTIONNAIRE_KIND_INVALID' USING ERRCODE='22023'; END IF;
  v_id:=(public.ensure_my_member_record()->>'member_id')::uuid;
  SELECT * INTO m FROM public.members WHERE id=v_id FOR UPDATE;
  IF m.user_id IS DISTINCT FROM auth.uid() OR m.account_status<>'active' OR m.anonymized_at IS NOT NULL OR m.record_scope<>'current'
    OR (p_kind<>'interview' AND (m.status<>'approved' OR m.membership_type<>'player')) THEN
    RAISE EXCEPTION 'QUESTIONNAIRE_PLAYER_REQUIRED' USING ERRCODE='42501';
  END IF;
  RETURN v_id;
END $$;

CREATE FUNCTION private.questionnaire_runtime(p_response uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT jsonb_build_object('kind',r.kind,'versionId',r.version_id,'template',v.template,'answers',r.answers,'isBaseline',v.is_baseline,'completed',r.completed_at IS NOT NULL,'revision',r.revision)
  FROM public.questionnaire_responses r JOIN public.questionnaire_versions v ON v.id=r.version_id WHERE r.id=p_response
$$;

CREATE FUNCTION private.questionnaire_get(p_kind text,p_retake boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_member uuid; t public.questionnaire_templates%ROWTYPE; v_response uuid; v_version uuid; baseline jsonb; legacy jsonb;
BEGIN
  v_member:=private.questionnaire_member(p_kind);
  IF p_retake AND p_kind<>'quiz' THEN RAISE EXCEPTION 'QUESTIONNAIRE_RETAKE_INVALID' USING ERRCODE='22023'; END IF;
  SELECT * INTO t FROM public.questionnaire_templates WHERE kind=p_kind;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT response_id INTO v_response FROM public.questionnaire_assignments WHERE member_id=v_member AND kind=p_kind;
  IF v_response IS NULL THEN
    SELECT template INTO baseline FROM public.questionnaire_versions WHERE id=t.baseline_version_id;
    legacy:=private.questionnaire_legacy(v_member,p_kind,baseline);
    v_version:=CASE WHEN (legacy->>'exists')::boolean THEN t.baseline_version_id ELSE t.published_version_id END;
    INSERT INTO public.questionnaire_responses(member_id,kind,version_id,answers,completed_at,legacy_imported,result_snapshot)
      VALUES(v_member,p_kind,v_version,CASE WHEN (legacy->>'exists')::boolean THEN legacy->'answers' ELSE '{}' END,
        CASE WHEN (legacy->>'completed')::boolean THEN now() END,(legacy->>'exists')::boolean,legacy->'result') RETURNING id INTO v_response;
    INSERT INTO public.questionnaire_assignments(member_id,kind,response_id) VALUES(v_member,p_kind,v_response);
  END IF;
  IF p_retake THEN
    INSERT INTO public.questionnaire_responses(member_id,kind,version_id,revision) VALUES(v_member,p_kind,t.published_version_id,(SELECT revision+1 FROM public.questionnaire_responses WHERE id=v_response)) RETURNING id INTO v_response;
    UPDATE public.questionnaire_assignments SET response_id=v_response WHERE member_id=v_member AND kind=p_kind;
  END IF;
  RETURN private.questionnaire_runtime(v_response);
END $$;

CREATE FUNCTION private.questionnaire_quiz_result(p_template jsonb,p_answers jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE q jsonb; opt jsonb; scores jsonb:='{"E":0,"A":0,"O":0,"C":0,"N":0}'; raw jsonb:=scores; mapped jsonb; dim text; min_raw numeric; max_raw numeric; value numeric; first_dim text; second_dim text; kind_label text; old_answers jsonb:='[]'; question_number integer;
BEGIN
  min_raw:=(p_template#>>'{quizConfig,scoring,minRaw}')::numeric;
  max_raw:=(p_template#>>'{quizConfig,scoring,maxRaw}')::numeric;
  FOR q IN SELECT x FROM jsonb_array_elements(p_template->'questions') x WHERE (x->>'active')::boolean AND x ? 'dimension' LOOP
    SELECT x INTO opt FROM jsonb_array_elements(q->'options') x WHERE x->>'value'=p_answers->>(q->>'id');
    IF opt IS NULL THEN
      IF (q->>'required')::boolean THEN RAISE EXCEPTION 'QUESTIONNAIRE_QUIZ_INCOMPLETE' USING ERRCODE='23514'; END IF;
      CONTINUE;
    END IF;
    dim:=q->>'dimension'; raw:=jsonb_set(raw,ARRAY[dim],to_jsonb((raw->>dim)::numeric+(opt->>'score')::numeric));
    IF q->>'builtinField' ~ '^quiz_[0-9]+$' THEN
      question_number:=substring(q->>'builtinField' FROM 6)::integer;
      old_answers:=old_answers||jsonb_build_array(jsonb_build_object('questionId',question_number,'score',(opt->>'score')::numeric));
    END IF;
  END LOOP;
  FOREACH dim IN ARRAY ARRAY['E','A','O','C','N'] LOOP
    value:=round(least(100,greatest(0,((raw->>dim)::numeric-min_raw)/(max_raw-min_raw)*100)));
    scores:=jsonb_set(scores,ARRAY[dim],to_jsonb(value));
  END LOOP;
  mapped:=scores-'N'||jsonb_build_object('ES',CASE WHEN (p_template#>>'{quizConfig,scoring,invertN}')::boolean THEN 100-(scores->>'N')::numeric ELSE (scores->>'N')::numeric END);
  SELECT entry.key INTO first_dim FROM jsonb_each_text(mapped) entry ORDER BY entry.value::numeric DESC,array_position(ARRAY['E','A','O','C','ES'],entry.key) LIMIT 1;
  SELECT entry.key INTO second_dim FROM jsonb_each_text(mapped) entry ORDER BY entry.value::numeric DESC,array_position(ARRAY['E','A','O','C','ES'],entry.key) LIMIT 1 OFFSET 1;
  kind_label:=COALESCE(p_template#>>ARRAY['quizConfig','typeLabels','formal','prefix',first_dim],CASE first_dim WHEN 'E' THEN '热情' WHEN 'A' THEN '温暖' WHEN 'O' THEN '好奇' WHEN 'C' THEN '稳健' ELSE '从容' END)
    ||COALESCE(p_template#>>ARRAY['quizConfig','typeLabels','formal','suffix',second_dim],CASE second_dim WHEN 'E' THEN '行动派' WHEN 'A' THEN '守护者' WHEN 'O' THEN '探索者' WHEN 'C' THEN '规划者' ELSE '安定者' END);
  RETURN jsonb_build_object('scores',scores,'personalityType',kind_label,'answers',old_answers);
END $$;

CREATE FUNCTION private.questionnaire_save(p_kind text,p_version_id uuid,p_answers jsonb,p_step smallint DEFAULT NULL,p_complete boolean DEFAULT true,p_expected_revision integer DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_member uuid; runtime jsonb; r public.questionnaire_responses%ROWTYPE; v_template jsonb; merged jsonb; payload jsonb:='{}'; legacy jsonb; q jsonb; value jsonb; result jsonb; step_no smallint; section_name text; p public.member_personality%ROWTYPE; interests public.member_interests%ROWTYPE; lang public.member_language%ROWTYPE; active_fields text[];
BEGIN
  -- This also locks the canonical member against account closure/anonymization.
  v_member:=private.questionnaire_member(p_kind);
  runtime:=private.questionnaire_get(p_kind,false);
  IF runtime IS NULL THEN RAISE EXCEPTION 'QUESTIONNAIRE_NOT_INITIALIZED' USING ERRCODE='22023'; END IF;
  SELECT x.* INTO r FROM public.questionnaire_responses x JOIN public.questionnaire_assignments a ON a.response_id=x.id WHERE a.member_id=v_member AND a.kind=p_kind FOR UPDATE OF x;
  IF p_version_id IS DISTINCT FROM r.version_id THEN RAISE EXCEPTION 'QUESTIONNAIRE_VERSION_CONFLICT' USING ERRCODE='PT409'; END IF;
  IF p_expected_revision IS NULL THEN RAISE EXCEPTION 'QUESTIONNAIRE_REVISION_REQUIRED' USING ERRCODE='22023'; END IF;
  IF p_expected_revision<>r.revision THEN RAISE EXCEPTION 'QUESTIONNAIRE_REVISION_CONFLICT' USING ERRCODE='PT409'; END IF;
  SELECT template INTO v_template FROM public.questionnaire_versions WHERE id=r.version_id;
  IF p_kind='interview' THEN
    IF p_step IS NOT NULL AND p_step NOT BETWEEN 1 AND 4 OR (p_step IS NULL AND NOT p_complete) THEN RAISE EXCEPTION 'QUESTIONNAIRE_STEP_INVALID' USING ERRCODE='22023'; END IF;
    section_name:=(ARRAY['basic','academic','interests','personality'])[p_step];
  ELSIF p_step IS NOT NULL THEN RAISE EXCEPTION 'QUESTIONNAIRE_STEP_INVALID' USING ERRCODE='22023'; END IF;
  IF jsonb_typeof(p_answers) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'QUESTIONNAIRE_ANSWERS_INVALID' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_each(p_answers) a JOIN jsonb_array_elements(v_template->'questions') AS question(definition) ON definition->>'id'=a.key WHERE
    (NOT (definition->>'active')::boolean OR (section_name IS NOT NULL AND definition->>'sectionId'<>section_name)) AND a.value IS DISTINCT FROM r.answers->a.key) THEN
    RAISE EXCEPTION 'QUESTIONNAIRE_SECTION_INVALID' USING ERRCODE='22023';
  END IF;
  merged:=r.answers||p_answers;
  -- Onboarding requires the current step immediately, other questionnaires may save a partial draft.
  PERFORM private.questionnaire_validate_answers(v_template,merged,CASE WHEN p_complete THEN NULL ELSE section_name END,p_complete OR p_step IS NOT NULL,r.answers);
  legacy:=private.questionnaire_legacy(v_member,p_kind,v_template);
  FOR q IN SELECT x FROM jsonb_array_elements(v_template->'questions') x WHERE x ? 'builtinField' LOOP
    value:=CASE WHEN (q->>'active')::boolean THEN merged->(q->>'id') ELSE legacy#>ARRAY['answers',q->>'id'] END;
    IF value IS NULL OR value='null'::jsonb THEN
      value:=CASE WHEN q->>'builtinField' IN ('accept_beginners','accept_cross_school','enrollment_year','graduation_year','birth_date') THEN 'null'::jsonb
        WHEN q->>'type'='multi' THEN '[]'::jsonb WHEN q->>'type' IN ('rating','number') THEN 'null'::jsonb ELSE '""'::jsonb END;
    END IF;
    IF q->>'builtinField' IN ('enrollment_year','graduation_year') AND value NOT IN ('null','""') THEN value:=to_jsonb((value#>>'{}')::integer); END IF;
    IF q->>'builtinField' IN ('enrollment_year','graduation_year') AND value='""'::jsonb THEN value:='null'::jsonb; END IF;
    IF q->>'builtinField' IN ('accept_beginners','accept_cross_school') AND value<>'null'::jsonb THEN value:=to_jsonb((value#>>'{}')::boolean); END IF;
    payload:=payload||jsonb_build_object(q->>'builtinField',value);
  END LOOP;
  IF p_kind='interview' THEN
    FOR step_no IN SELECT unnest(CASE WHEN p_step IS NULL THEN ARRAY[1,2,3,4]::smallint[] ELSE ARRAY[p_step] END) LOOP
      PERFORM public.save_my_onboarding_step(step_no,(SELECT COALESCE(jsonb_object_agg(e.key,e.value),'{}') FROM jsonb_each(payload) e WHERE e.key=ANY(
        CASE step_no WHEN 1 THEN ARRAY['full_name','nickname','gender','birth_date','nationality','current_city']
          WHEN 2 THEN ARRAY['school_name','department','degree_level','course_language','enrollment_year']
          WHEN 3 THEN ARRAY['hobby_tags','activity_type_tags'] ELSE ARRAY['personality_self_tags','taboo_tags'] END)));
    END LOOP;
    IF p_complete THEN PERFORM public.submit_my_onboarding(); END IF;
  ELSIF p_kind='supplementary' THEN
    SELECT * INTO interests FROM jsonb_populate_record(NULL::public.member_interests,payload);
    SELECT * INTO lang FROM jsonb_populate_record(NULL::public.member_language,payload);
    INSERT INTO public.member_language(member_id,communication_language_pref,japanese_level)
      VALUES(v_member,COALESCE(lang.communication_language_pref,'{}'),NULLIF(lang.japanese_level,''))
      ON CONFLICT(member_id) DO UPDATE SET communication_language_pref=EXCLUDED.communication_language_pref,japanese_level=EXCLUDED.japanese_level;
    INSERT INTO public.member_interests(member_id,activity_area,nearest_station,graduation_year,game_type_pref,scenario_mode_pref,scenario_theme_tags,ideal_group_size,script_preference,non_script_preference,activity_frequency,preferred_time_slots,budget_range,travel_radius,social_goal_primary,social_goal_secondary,accept_beginners,accept_cross_school)
      VALUES(v_member,NULLIF(interests.activity_area,''),NULLIF(interests.nearest_station,''),interests.graduation_year,NULLIF(interests.game_type_pref,''),COALESCE(interests.scenario_mode_pref,'{}'),COALESCE(interests.scenario_theme_tags,'{}'),NULLIF(interests.ideal_group_size,''),COALESCE(interests.script_preference,'{}'),COALESCE(interests.non_script_preference,'{}'),NULLIF(interests.activity_frequency,''),COALESCE(interests.preferred_time_slots,'{}'),NULLIF(interests.budget_range,''),NULLIF(interests.travel_radius,''),NULLIF(interests.social_goal_primary,''),NULLIF(interests.social_goal_secondary,''),interests.accept_beginners,interests.accept_cross_school)
      ON CONFLICT(member_id) DO UPDATE SET activity_area=EXCLUDED.activity_area,nearest_station=EXCLUDED.nearest_station,graduation_year=EXCLUDED.graduation_year,game_type_pref=EXCLUDED.game_type_pref,scenario_mode_pref=EXCLUDED.scenario_mode_pref,scenario_theme_tags=EXCLUDED.scenario_theme_tags,ideal_group_size=EXCLUDED.ideal_group_size,script_preference=EXCLUDED.script_preference,non_script_preference=EXCLUDED.non_script_preference,activity_frequency=EXCLUDED.activity_frequency,preferred_time_slots=EXCLUDED.preferred_time_slots,budget_range=EXCLUDED.budget_range,travel_radius=EXCLUDED.travel_radius,social_goal_primary=EXCLUDED.social_goal_primary,social_goal_secondary=EXCLUDED.social_goal_secondary,accept_beginners=EXCLUDED.accept_beginners,accept_cross_school=EXCLUDED.accept_cross_school;
  ELSIF p_kind='personality' THEN
    SELECT * INTO p FROM jsonb_populate_record(NULL::public.member_personality,payload);
    -- A disabled or unanswered dimension never becomes a submitted middle score.
    -- Existing legacy values remain intact; new-row defaults are database defaults only.
    SELECT array_agg(x->>'builtinField') INTO active_fields FROM jsonb_array_elements(v_template->'questions') x WHERE (x->>'active')::boolean;
    INSERT INTO public.member_personality(member_id) VALUES(v_member) ON CONFLICT(member_id) DO NOTHING;
    UPDATE public.member_personality AS current SET
      extroversion=CASE WHEN 'extroversion'=ANY(active_fields) AND p.extroversion IS NOT NULL THEN p.extroversion ELSE current.extroversion END,
      initiative=CASE WHEN 'initiative'=ANY(active_fields) AND p.initiative IS NOT NULL THEN p.initiative ELSE current.initiative END,
      emotional_stability=CASE WHEN 'emotional_stability'=ANY(active_fields) AND p.emotional_stability IS NOT NULL THEN p.emotional_stability ELSE current.emotional_stability END,
      expression_style_tags=CASE WHEN 'expression_style_tags'=ANY(active_fields) THEN p.expression_style_tags ELSE current.expression_style_tags END,
      group_role_tags=CASE WHEN 'group_role_tags'=ANY(active_fields) THEN p.group_role_tags ELSE current.group_role_tags END,
      warmup_speed=CASE WHEN 'warmup_speed'=ANY(active_fields) THEN NULLIF(p.warmup_speed,'') ELSE current.warmup_speed END,
      planning_style=CASE WHEN 'planning_style'=ANY(active_fields) THEN NULLIF(p.planning_style,'') ELSE current.planning_style END,
      coop_compete_tendency=CASE WHEN 'coop_compete_tendency'=ANY(active_fields) THEN NULLIF(p.coop_compete_tendency,'') ELSE current.coop_compete_tendency END,
      boundary_strength=CASE WHEN 'boundary_strength'=ANY(active_fields) THEN NULLIF(p.boundary_strength,'') ELSE current.boundary_strength END,
      reply_speed=CASE WHEN 'reply_speed'=ANY(active_fields) THEN NULLIF(p.reply_speed,'') ELSE current.reply_speed END
      WHERE member_id=v_member;
  ELSIF p_kind='quiz' AND p_complete THEN
    result:=private.questionnaire_quiz_result(v_template,merged);
    INSERT INTO public.personality_quiz_results(member_id,answers,score_e,score_a,score_o,score_c,score_n,personality_type,completed_at,updated_at)
      VALUES(v_member,result->'answers',(result#>>'{scores,E}')::integer,(result#>>'{scores,A}')::integer,(result#>>'{scores,O}')::integer,(result#>>'{scores,C}')::integer,(result#>>'{scores,N}')::integer,result->>'personalityType',now(),now())
      ON CONFLICT(member_id) DO UPDATE SET answers=EXCLUDED.answers,score_e=EXCLUDED.score_e,score_a=EXCLUDED.score_a,score_o=EXCLUDED.score_o,score_c=EXCLUDED.score_c,score_n=EXCLUDED.score_n,personality_type=EXCLUDED.personality_type,completed_at=EXCLUDED.completed_at,updated_at=EXCLUDED.updated_at;
  END IF;
  UPDATE public.questionnaire_responses SET answers=merged,revision=revision+1,completed_at=CASE WHEN p_complete THEN now() ELSE completed_at END,result_snapshot=COALESCE(result,result_snapshot),updated_at=now() WHERE id=r.id;
  RETURN private.questionnaire_runtime(r.id);
END $$;

CREATE FUNCTION public.get_admin_questionnaires() RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.questionnaire_admin_list() $$;
CREATE FUNCTION public.initialize_questionnaire_template(p_kind text,p_template jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.questionnaire_initialize(p_kind,p_template) $$;
CREATE FUNCTION public.save_questionnaire_draft(p_kind text,p_expected_revision integer,p_template jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.questionnaire_save_draft(p_kind,p_expected_revision,p_template) $$;
CREATE FUNCTION public.publish_questionnaire_draft(p_kind text,p_expected_revision integer) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.questionnaire_publish(p_kind,p_expected_revision) $$;
CREATE FUNCTION public.get_my_questionnaire(p_kind text) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.questionnaire_get(p_kind,false) $$;
CREATE FUNCTION public.start_my_questionnaire_retake(p_kind text) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.questionnaire_get(p_kind,true) $$;
CREATE FUNCTION public.save_my_questionnaire(p_kind text,p_version_id uuid,p_answers jsonb,p_step smallint DEFAULT NULL,p_complete boolean DEFAULT true,p_expected_revision integer DEFAULT NULL) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.questionnaire_save(p_kind,p_version_id,p_answers,p_step,p_complete,p_expected_revision) $$;

-- Helpers are not executable by clients; only the checked private entry points are.
REVOKE ALL ON FUNCTION private.questionnaire_trusted_baseline(text),private.questionnaire_immutable_version(),private.questionnaire_protect_response(),private.questionnaire_erase_anonymized(),private.questionnaire_validate_template(text,jsonb,jsonb),private.questionnaire_validate_answers(jsonb,jsonb,text,boolean,jsonb),private.questionnaire_legacy(uuid,text,jsonb),private.questionnaire_member(text),private.questionnaire_runtime(uuid),private.questionnaire_quiz_result(jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.questionnaire_admin_list(),private.questionnaire_initialize(text,jsonb),private.questionnaire_save_draft(text,integer,jsonb),private.questionnaire_publish(text,integer),private.questionnaire_get(text,boolean),private.questionnaire_save(text,uuid,jsonb,smallint,boolean,integer) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.get_admin_questionnaires(),public.initialize_questionnaire_template(text,jsonb),public.save_questionnaire_draft(text,integer,jsonb),public.publish_questionnaire_draft(text,integer),public.get_my_questionnaire(text),public.start_my_questionnaire_retake(text),public.save_my_questionnaire(text,uuid,jsonb,smallint,boolean,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.questionnaire_admin_list(),private.questionnaire_initialize(text,jsonb),private.questionnaire_save_draft(text,integer,jsonb),private.questionnaire_publish(text,integer),private.questionnaire_get(text,boolean),private.questionnaire_save(text,uuid,jsonb,smallint,boolean,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_questionnaires(),public.initialize_questionnaire_template(text,jsonb),public.save_questionnaire_draft(text,integer,jsonb),public.publish_questionnaire_draft(text,integer),public.get_my_questionnaire(text),public.start_my_questionnaire_retake(text),public.save_my_questionnaire(text,uuid,jsonb,smallint,boolean,integer) TO authenticated;
